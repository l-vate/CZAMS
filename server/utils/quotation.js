// The quotation details of an Installation booking: how long it takes, what the price does not cover, the warranty terms, whether the
// quoted prices already include VAT, and the site details. The pure rules live here; routes/quotationRoutes.js loads, saves, audits and
// notifies.
//
// Defaults (constants/quotationDefaults.json, the warranty numbers in constants/warrantyWindows.json) are written onto a NEW Installation
// booking when it is made, so a later change to a default never rewrites a booking that already exists. A booking made before these fields
// existed has none: it shows none, and its warranty follows the standard windows exactly as before. The admin can change any of them per
// booking; a change to the warranty months also decides how long the workmanship warranty runs for that booking.
const { invalid } = require('./validation');
const { SERVICE_TYPE } = require('../constants/serviceTypes');
const defaults = require('../constants/quotationDefaults.json');
const windows = require('../constants/warrantyWindows.json');
const { UNIT_WARRANTY_YEARS } = require('./warranty');

const LIMITS = defaults.limits;

// The numbers every installation starts from, by service type (null for a service that has none).
function defaultsFor(serviceType) {
  const days = defaults.durationDays[serviceType];
  const exclusions = defaults.exclusions[serviceType];
  if (!days && !exclusions) return null;
  return { estimatedDays: days ? { ...days } : undefined, exclusions: exclusions ? [...exclusions] : undefined };
}

// What is written on a new booking of this service type, or undefined when it has no defaults.
function startingQuotation(serviceType) {
  return defaultsFor(serviceType) || undefined;
}

// The standard workmanship months for an Installation, by where the unit came from (warrantyWindows.json).
const standardMonths = (clientSupplied) => (clientSupplied ? windows.installationCustomerUnit.months : windows.installationCompanyUnit.months);

// The unit warranty sentence that stands unless the admin writes another: compressor and minor parts, from the standard numbers.
function standardUnitText() {
  const { compressor, minorParts } = UNIT_WARRANTY_YEARS;
  return `Compressor ${compressor} ${compressor === 1 ? 'year' : 'years'}, minor parts ${minorParts} ${minorParts === 1 ? 'year' : 'years'} (remote control not included).`;
}

// What a booking carries, ready to show: the effective terms. `null` for a booking that is not an Installation.
function quotationOf(booking) {
  if (booking?.service?.serviceType !== SERVICE_TYPE.INSTALLATION) return null;
  const q = booking.quotation || {};
  const clientSupplied = !!booking.clientSuppliedUnit;
  const customMonths = Number.isFinite(q.warrantyMonths) ? q.warrantyMonths : null;
  const customText = typeof q.unitWarrantyText === 'string' && q.unitWarrantyText.trim() ? q.unitWarrantyText.trim() : null;
  return {
    estimatedDays: q.estimatedDays && Number.isFinite(q.estimatedDays.min) ? { min: q.estimatedDays.min, max: q.estimatedDays.max } : null,
    exclusions: Array.isArray(q.exclusions) && q.exclusions.length > 0 ? [...q.exclusions] : null,
    warranty: {
      workmanshipMonths: customMonths ?? standardMonths(clientSupplied),
      workmanshipCustom: customMonths !== null,
      // the unit itself is covered only when the company supplied it
      unitText: clientSupplied ? null : (customText ?? standardUnitText()),
      unitTextCustom: !clientSupplied && customText !== null,
    },
    taxInclusive: !!booking.taxInclusive,
  };
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const whole = (n) => Number.isInteger(n) && n >= 1 && n <= LIMITS.maxDays;

// What an admin may send. Every field is optional; one that is not sent is left alone. `null` clears a field back to its default.
// Returns { problem, changes } where changes holds only what was sent, in the shape the booking stores:
//   estimatedDays { min, max } | null, exclusions [text] | null, warrantyMonths number | null, unitWarrantyText text | null,
//   taxInclusive boolean, site { building, floorRoom, attention }
function readQuotationInput(body = {}) {
  const changes = {};

  if (body.estimatedDays !== undefined) {
    if (body.estimatedDays === null) changes.estimatedDays = null;
    else {
      const min = Number(body.estimatedDays.min);
      const max = body.estimatedDays.max === undefined || body.estimatedDays.max === '' || body.estimatedDays.max === null ? min : Number(body.estimatedDays.max);
      if (!whole(min) || !whole(max) || max < min) return { problem: invalid(`Give the estimated days as whole numbers from 1 to ${LIMITS.maxDays}, the last one not before the first.`) };
      changes.estimatedDays = { min, max };
    }
  }

  if (body.exclusions !== undefined) {
    if (body.exclusions === null) changes.exclusions = null;
    else {
      if (!Array.isArray(body.exclusions)) return { problem: invalid('Send the exclusions as a list of lines.') };
      const lines = body.exclusions.map(clean).filter(Boolean);
      if (lines.length > LIMITS.exclusionCount) return { problem: invalid(`List at most ${LIMITS.exclusionCount} exclusions.`) };
      if (lines.some((l) => l.length > LIMITS.exclusionLength)) return { problem: invalid(`Keep each exclusion to ${LIMITS.exclusionLength} characters or fewer.`) };
      changes.exclusions = lines;
    }
  }

  if (body.warrantyMonths !== undefined) {
    if (body.warrantyMonths === null || body.warrantyMonths === '') changes.warrantyMonths = null;
    else {
      const months = Number(body.warrantyMonths);
      if (!Number.isInteger(months) || months < 0 || months > LIMITS.warrantyMonthsMax) return { problem: invalid(`The workmanship warranty is a whole number of months from 0 to ${LIMITS.warrantyMonthsMax}.`) };
      changes.warrantyMonths = months;
    }
  }

  if (body.unitWarrantyText !== undefined) {
    if (body.unitWarrantyText === null) changes.unitWarrantyText = null;
    else {
      const text = clean(body.unitWarrantyText);
      if (text.length > LIMITS.unitWarrantyText) return { problem: invalid(`Keep the unit warranty text to ${LIMITS.unitWarrantyText} characters or fewer.`) };
      changes.unitWarrantyText = text || null;
    }
  }

  if (body.taxInclusive !== undefined) {
    if (typeof body.taxInclusive !== 'boolean') return { problem: invalid('Say whether the quoted prices include VAT or not.') };
    changes.taxInclusive = body.taxInclusive;
  }

  if (body.site !== undefined) {
    const site = readSite(body.site);
    if (site.problem) return site;
    changes.site = site.site;
  }

  if (Object.keys(changes).length === 0) return { problem: invalid('Nothing to change.') };
  return { problem: null, changes };
}

// The site details a customer or the admin may give: the building, the floor or room, and who to ask for (the "Attention" line).
function readSite(raw) {
  if (raw === null) return { problem: null, site: { building: '', floorRoom: '', attention: '' } };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { problem: invalid('Send the site details as building, floor or room and attention.') };
  const site = { building: clean(raw.building), floorRoom: clean(raw.floorRoom), attention: clean(raw.attention) };
  if (Object.values(site).some((v) => v.length > LIMITS.siteField)) return { problem: invalid(`Keep each site detail to ${LIMITS.siteField} characters or fewer.`) };
  return { problem: null, site };
}

// The values an admin's change takes from `booking`, for the audit trail: only the fields that change, before and after.
function describeChange(booking, changes) {
  const q = booking.quotation || {};
  const before = {};
  const after = {};
  if ('estimatedDays' in changes) { before.estimatedDays = q.estimatedDays ? `${q.estimatedDays.min}-${q.estimatedDays.max}` : null; after.estimatedDays = changes.estimatedDays ? `${changes.estimatedDays.min}-${changes.estimatedDays.max}` : null; }
  if ('exclusions' in changes) { before.exclusions = (q.exclusions || []).join('; ') || null; after.exclusions = (changes.exclusions || []).join('; ') || null; }
  if ('warrantyMonths' in changes) { before.warrantyMonths = Number.isFinite(q.warrantyMonths) ? q.warrantyMonths : null; after.warrantyMonths = changes.warrantyMonths; }
  if ('unitWarrantyText' in changes) { before.unitWarrantyText = q.unitWarrantyText || null; after.unitWarrantyText = changes.unitWarrantyText; }
  if ('taxInclusive' in changes) { before.taxInclusive = !!booking.taxInclusive; after.taxInclusive = changes.taxInclusive; }
  if ('site' in changes) {
    const s = booking.site || {};
    before.site = [s.building, s.floorRoom, s.attention].filter(Boolean).join(' / ') || null;
    after.site = [changes.site.building, changes.site.floorRoom, changes.site.attention].filter(Boolean).join(' / ') || null;
  }
  return { before, after };
}

module.exports = {
  LIMITS, defaultsFor, startingQuotation, standardMonths, standardUnitText, quotationOf, readQuotationInput, readSite, describeChange,
};
