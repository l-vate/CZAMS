// Warranty Tracking Module - single source of truth for warranty date math, so
// Back Job Handling (and anything else that needs to know "is this still covered")
// calls getWarrantyStatus(booking) instead of reimplementing these rules.

const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { effectiveCompletedAt } = require('./completion');

// Coverage periods, from the client interview / CZAMS_Feature_Requirements.md
// section 8. Named constants so a period change later is a one-line edit.
const WARRANTY_PERIODS = {
  CLEANING_DAYS: 7, // 1 week, water leaks only
  INSTALLATION_CZA_UNIT_WORKMANSHIP_MONTHS: 6,
  INSTALLATION_CLIENT_UNIT_WORKMANSHIP_MONTHS: 3,
  UNIT_COMPRESSOR_YEARS: 5,
  UNIT_MINOR_PARTS_YEARS: 1,
  LEAK_REPAIR_MONTHS: 1, // client-confirmed, own category distinct from Cleaning/Installation
};

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
function getWarrantyStatus(booking) {
  const serviceType = booking?.service?.serviceType;

  // Nothing is "covered" until the job is actually done.
  const completedAt = effectiveCompletedAt(booking);
  if (booking?.status !== BOOKING_STATUS.COMPLETED || !completedAt) {
    return NOT_APPLICABLE;
  }

  const now = new Date();

  if (serviceType === SERVICE_TYPE.CLEANING) {
    const expiresAt = addDays(completedAt, WARRANTY_PERIODS.CLEANING_DAYS);
    return {
      applicable: true,
      type: 'Cleaning',
      scope: 'Water leaks only',
      workmanship: { expiresAt, active: now <= expiresAt },
      unit: null,
    };
  }

  if (serviceType === SERVICE_TYPE.INSTALLATION) {
    const clientSupplied = !!booking.clientSuppliedUnit;
    const workmanshipMonths = clientSupplied
      ? WARRANTY_PERIODS.INSTALLATION_CLIENT_UNIT_WORKMANSHIP_MONTHS
      : WARRANTY_PERIODS.INSTALLATION_CZA_UNIT_WORKMANSHIP_MONTHS;
    const workmanshipExpiresAt = addMonths(completedAt, workmanshipMonths);

    // Unit warranty (compressor/minor parts) only exists for a unit CZA actually
    // supplied - a client-supplied unit has no unit warranty at all (that's what
    // the waiver acknowledges).
    const unit = clientSupplied ? null : {
      compressorExpiresAt: addYears(completedAt, WARRANTY_PERIODS.UNIT_COMPRESSOR_YEARS),
      minorPartsExpiresAt: addYears(completedAt, WARRANTY_PERIODS.UNIT_MINOR_PARTS_YEARS),
      compressorActive: now <= addYears(completedAt, WARRANTY_PERIODS.UNIT_COMPRESSOR_YEARS),
      minorPartsActive: now <= addYears(completedAt, WARRANTY_PERIODS.UNIT_MINOR_PARTS_YEARS),
      excludes: 'Remote control',
    };

    return {
      applicable: true,
      type: clientSupplied ? 'Installation (client-supplied unit)' : 'Installation (CZA-supplied unit)',
      scope: 'Workmanship (e.g. leaking refrigerant pipes)',
      workmanship: { expiresAt: workmanshipExpiresAt, active: now <= workmanshipExpiresAt },
      unit,
    };
  }

  // Leak Repair: a fifth, standalone warranty category - a paid repair (system
  // reprocess/leak repair/flushing/vacuum/charging) triggered by a refrigerant
  // undercharge found during Cleaning or a paid check-up, distinct from the
  // Cleaning/Installation warranties above.
  if (serviceType === SERVICE_TYPE.LEAK_REPAIR) {
    const expiresAt = addMonths(completedAt, WARRANTY_PERIODS.LEAK_REPAIR_MONTHS);
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

module.exports = { getWarrantyStatus, WARRANTY_PERIODS, addDays, addMonths, addYears, manilaDay };
