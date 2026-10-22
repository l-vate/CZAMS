// Warranty Tracking Module - single source of truth for warranty date math, so
// Back Job Handling (and anything else that needs to know "is this still covered")
// calls getWarrantyStatus(booking) instead of reimplementing these rules.

const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { effectiveCompletedAt } = require('./completion');

// The warranty windows, the owner's answers, in one place. Each runs from the day the job was completed (Manila calendar day) and is
// counted in calendar days or calendar months (never 30-day approximations). Which window a booking gets:
//   service type Cleaning                                  -> cleaning (water leaks only)
//   service type Installation, unit bought from Cooling Zone  -> installationCompanyUnit
//   service type Installation, unit supplied by the customer  -> installationCustomerUnit (workmanship only; no warranty on the unit)
//   service type Leak Repair (system reprocess)            -> leakRepair
// Repair, Maintenance, Check-up and Other have no window (the owner has not set one), so they are never "in warranty".
// The numbers live in constants/warrantyWindows.json (inside server/, so the server deploys on its own). The public landing page imports
// that same file, so there is one copy of them.
const windows = require('../constants/warrantyWindows.json');
const WARRANTY_WINDOWS = Object.freeze(Object.fromEntries(Object.entries(windows).map(([key, value]) => [key, Object.freeze({ ...value })])));

// The warranty on the physical unit, only for a unit bought from Cooling Zone (kept from the client interview; not part of the owner's answers).
const UNIT_WARRANTY_YEARS = Object.freeze({ compressor: 5, minorParts: 1 });

// Kept under their old names for the code and tests that read them.
const WARRANTY_PERIODS = {
  CLEANING_DAYS: WARRANTY_WINDOWS.cleaning.days,
  INSTALLATION_CZA_UNIT_WORKMANSHIP_MONTHS: WARRANTY_WINDOWS.installationCompanyUnit.months,
  INSTALLATION_CLIENT_UNIT_WORKMANSHIP_MONTHS: WARRANTY_WINDOWS.installationCustomerUnit.months,
  UNIT_COMPRESSOR_YEARS: UNIT_WARRANTY_YEARS.compressor,
  UNIT_MINOR_PARTS_YEARS: UNIT_WARRANTY_YEARS.minorParts,
  LEAK_REPAIR_MONTHS: WARRANTY_WINDOWS.leakRepair.months,
};

// 'company' or 'customer' for an Installation booking (where the unit came from), null for any other service.
function unitSourceOf(booking) {
  if (booking?.service?.serviceType !== SERVICE_TYPE.INSTALLATION) return null;
  return booking.clientSuppliedUnit ? 'customer' : 'company';
}

// The end of the window for a job completed at `completedAt`: the end of the last Manila day.
function windowEnd(completedAt, window) {
  return window.days !== undefined ? addDays(completedAt, window.days) : addMonths(completedAt, window.months);
}

// All of the warranty date math is done in Philippine time (Asia/Manila, UTC+8, no daylight saving), whatever time
// zone the server runs in. The rule used, for every period:
//   - the warranty starts on the Manila calendar day the job was completed (the report was submitted);
//   - it lasts for the period counted in Manila calendar days, months or years from that day;
//   - and it ends at the END of that last Manila day (23:59:59.999), so the customer has the whole day.
// When a month has no such day (completed 31 August, six months on is "31 February"), the warranty ends on the last day
// of that month (28 February, or 29 in a leap year); it never rolls over into March.
// Example: completed 2026-08-31 20:00 UTC, which is 1 September 04:00 in Manila, with a 6-month warranty: it ends at the
// end of 1 March 2027 in Manila, 2027-03-01T15:59:59.999Z, on a server in any time zone.
const MANILA_OFFSET_MS = 8 * 3600000;

// The Manila calendar day of an instant: { year, month (0 to 11), day }.
function manilaDay(date) {
  const shifted = new Date(new Date(date).getTime() + MANILA_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

// The instant that is the end (23:59:59.999) of a Manila calendar day. `day` may overflow the month; Date.UTC carries it.
function endOfManilaDay(year, month, day) {
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - MANILA_OFFSET_MS);
}

function addDays(date, days) {
  const { year, month, day } = manilaDay(date);
  return endOfManilaDay(year, month, day + days);
}

function addMonths(date, months) {
  const { year, month, day } = manilaDay(date);
  const total = year * 12 + month + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return endOfManilaDay(targetYear, targetMonth, Math.min(day, lastDay));
}

function addYears(date, years) {
  return addMonths(date, years * 12);
}

const NOT_APPLICABLE = { applicable: false, type: null, scope: null, workmanship: null, unit: null };

// booking must have `service` populated (needs service.serviceType) and, for
// Installation bookings, `clientSuppliedUnit`. Returns a structured status rather
// than a single flag, since a CZA-supplied-unit installation carries two separate
// coverages (workmanship on the job, and a longer warranty on the physical unit)
// that a warranty claim needs to be checked against independently.
function getWarrantyStatus(booking, now = new Date()) {
  const serviceType = booking?.service?.serviceType;

  // Nothing is "covered" until the job is actually done.
  const completedAt = effectiveCompletedAt(booking);
  if (booking?.status !== BOOKING_STATUS.COMPLETED || !completedAt) {
    return NOT_APPLICABLE;
  }

  if (serviceType === SERVICE_TYPE.CLEANING) {
    const expiresAt = windowEnd(completedAt, WARRANTY_WINDOWS.cleaning);
    return {
      applicable: true,
      type: 'Cleaning',
      scope: WARRANTY_WINDOWS.cleaning.scope,
      workmanship: { expiresAt, active: now <= expiresAt },
      unit: null,
    };
  }

  if (serviceType === SERVICE_TYPE.INSTALLATION) {
    const clientSupplied = !!booking.clientSuppliedUnit;
    // The standard window, unless the admin set the workmanship months for this booking (its quotation): then that is what it gets.
    const customMonths = Number.isFinite(booking.quotation?.warrantyMonths) ? booking.quotation.warrantyMonths : null;
    const workmanshipExpiresAt = customMonths !== null
      ? addMonths(completedAt, customMonths)
      : windowEnd(completedAt, clientSupplied ? WARRANTY_WINDOWS.installationCustomerUnit : WARRANTY_WINDOWS.installationCompanyUnit);

    // Unit warranty (compressor/minor parts) only exists for a unit CZA actually
    // supplied - a client-supplied unit has no unit warranty at all (that's what
    // the waiver acknowledges).
    const unit = clientSupplied ? null : {
      compressorExpiresAt: addYears(completedAt, UNIT_WARRANTY_YEARS.compressor),
      minorPartsExpiresAt: addYears(completedAt, UNIT_WARRANTY_YEARS.minorParts),
      compressorActive: now <= addYears(completedAt, UNIT_WARRANTY_YEARS.compressor),
      minorPartsActive: now <= addYears(completedAt, UNIT_WARRANTY_YEARS.minorParts),
      excludes: 'Remote control',
    };

    return {
      applicable: true,
      type: clientSupplied ? 'Installation (client-supplied unit)' : 'Installation (CZA-supplied unit)',
      scope: 'Workmanship (e.g. leaking refrigerant pipes)',
      unitSource: clientSupplied ? 'customer' : 'company',
      workmanship: { expiresAt: workmanshipExpiresAt, active: now <= workmanshipExpiresAt },
      unit,
    };
  }

  // Leak Repair: a fifth, standalone warranty category - a paid repair (system
  // reprocess/leak repair/flushing/vacuum/charging) triggered by a refrigerant
  // undercharge found during Cleaning or a paid check-up, distinct from the
  // Cleaning/Installation warranties above.
  if (serviceType === SERVICE_TYPE.LEAK_REPAIR) {
    const expiresAt = windowEnd(completedAt, WARRANTY_WINDOWS.leakRepair);
    return {
      applicable: true,
      type: 'Leak Repair',
      scope: 'Workmanship on the repair (reprocess/flushing/vacuum/charging)',
      workmanship: { expiresAt, active: now <= expiresAt },
      unit: null,
    };
  }

  // Repair / Other / unclassified services have no defined warranty in the paper.
  return NOT_APPLICABLE;
}

module.exports = { getWarrantyStatus, WARRANTY_WINDOWS, UNIT_WARRANTY_YEARS, unitSourceOf, WARRANTY_PERIODS, addDays, addMonths, addYears, manilaDay };
