// What a technician may see of a booking. Every technician-reachable route that returns a booking
// goes through here, so the response is an explicit WHITELIST: a field added to the Booking model
// later stays hidden from technicians until it is listed below on purpose.
//
// Deliberately not here: the discount and its ID photo, payment and refund data, proofs,
// reference numbers, prices, the customer's email, who reviewed or approved anything, queue
// position and the assignment history (that has its own read-only route).
const idOf = (x) => (x ? String(x._id || x) : null);

const pick = (source, keys) => {
  const out = {};
  keys.forEach((key) => {
    if (source && source[key] !== undefined) out[key] = source[key];
  });
  return out;
};

const person = (p) => (p && typeof p === 'object' ? { _id: idOf(p), name: p.name } : p ? { _id: idOf(p) } : null);

const unitList = (units) => (units || []).map((u) => pick(u, ['type', 'quantity', 'brandModel', 'hp']));

// `booking` is a plain object (toObject()) with service, customer and assignments populated.
// `extra` carries values computed for this technician, such as { myRole }.
function toTechnicianView(booking, extra = {}) {
  const b = booking || {};
  return {
    _id: b._id,
    bookingId: b.bookingId,
    status: b.status,
    createdAt: b.createdAt,
    date: b.date,
    time: b.time,
    address: b.address,
    contactNumber: b.contactNumber,
    problemDescription: b.problemDescription,
    technicianInstructions: b.technicianInstructions,
    site: b.site ? pick(b.site, ['building', 'floorRoom', 'attention']) : undefined,

    service: b.service && typeof b.service === 'object'
      ? pick(b.service, ['_id', 'name', 'serviceType', 'category'])
      : b.service,
    units: unitList(b.units),
    unitTypes: b.unitTypes || [],
    brandModel: b.brandModel,
    clientSuppliedUnit: !!b.clientSuppliedUnit,
    cleaningTierAnswers: b.cleaningTierAnswers ? pick(b.cleaningTierAnswers, ['lastCleanedOver6MonthsAgo', 'isActivelyLeaking']) : undefined,

    // null means the customer deleted their account: the technician sees "Deleted customer", never a blank or a made up name
    customer: b.customer === null ? { name: 'Deleted customer', phone: '' } : (b.customer && typeof b.customer === 'object' ? { name: b.customer.name, phone: b.customer.phone } : undefined),

    technician: person(b.technician),
    assignments: (b.assignments || []).map((a) => ({
      team: a.team && typeof a.team === 'object' ? { name: a.team.name } : null,
      lead: person(a.lead),
      helper: person(a.helper),
    })),

    isBackJob: !!b.isBackJob,
    backJobId: b.backJobId || null,
    reportSubmitted: !!b.reportSubmitted,

    disruption: b.disruption ? pick(b.disruption, ['status', 'reason', 'reportedAt', 'rescheduledAt']) : undefined,
    // read only: a technician can see that the customer reported a no show on the job (never the note, and no score comes from it)
    noShow: b.noShow && b.noShow.status && b.noShow.status !== 'None' ? pick(b.noShow, ['status', 'reportedAt']) : undefined,
    extensionRequest: b.extensionRequest ? pick(b.extensionRequest, ['status', 'reason', 'requestedDate', 'requestedTime', 'requestedAt', 'decidedAt']) : undefined,
    // the extra days an admin approved, as a date and a time block (no admin id)
    extensionDays: (b.extensionDays || []).map((d) => pick(d, ['date', 'time'])),

    ...extra,
  };
}

module.exports = { toTechnicianView };
