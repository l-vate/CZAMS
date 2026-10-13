// Warranty Tracking Module — single source of truth for warranty date math, so
// Back Job Handling (and anything else that needs to know "is this still covered")
// calls getWarrantyStatus(booking) instead of reimplementing these rules.

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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
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
  if (booking?.status !== 'Completed' || !booking?.completedAt) {
    return NOT_APPLICABLE;
  }

  const now = new Date();
  const completedAt = booking.completedAt;

  if (serviceType === 'Cleaning') {
    const expiresAt = addDays(completedAt, WARRANTY_PERIODS.CLEANING_DAYS);
    return {
      applicable: true,
      type: 'Cleaning',
      scope: 'Water leaks only',
      workmanship: { expiresAt, active: now <= expiresAt },
      unit: null,
    };
  }

  if (serviceType === 'Installation') {
    const clientSupplied = !!booking.clientSuppliedUnit;
    const workmanshipMonths = clientSupplied
      ? WARRANTY_PERIODS.INSTALLATION_CLIENT_UNIT_WORKMANSHIP_MONTHS
      : WARRANTY_PERIODS.INSTALLATION_CZA_UNIT_WORKMANSHIP_MONTHS;
    const workmanshipExpiresAt = addMonths(completedAt, workmanshipMonths);

    // Unit warranty (compressor/minor parts) only exists for a unit CZA actually
    // supplied — a client-supplied unit has no unit warranty at all (that's what
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

  // Leak Repair: a fifth, standalone warranty category — a paid repair (system
  // reprocess/leak repair/flushing/vacuum/charging) triggered by a refrigerant
  // undercharge found during Cleaning or a paid check-up, distinct from the
  // Cleaning/Installation warranties above.
  if (serviceType === 'Leak Repair') {
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

module.exports = { getWarrantyStatus, WARRANTY_PERIODS };
