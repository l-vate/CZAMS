// What a customer may see of a booking. Every route a customer can call that returns a booking goes through
// here, so the response is an explicit WHITELIST: a field added to the Booking model later stays hidden from
// customers until it is listed below on purpose (a test fails until each new field is classified).
//
// Deliberately not here: the admin's instructions for the technicians, the assignment history, who reviewed or
// processed anything (admin names and ids), the queue position, the service-area review flag, the admin's
// first-approval time, and the technicians' own reasons for a disruption or extension.
//
// Kept on purpose, because the customer's own screens show them to the customer: the reason a discount was not
// approved, and the reason a refund amount was adjusted.

const { paymentDueOf, unitAwaitingConfirmation } = require('./paymentDue');

const pick = (source, keys) => {
  const out = {};
  keys.forEach((key) => {
    if (source && source[key] !== undefined) out[key] = source[key];
  });
  return out;
};

// A technician as a customer sees them: the name and nothing else (no id, email or phone). A technician that was not
// populated (only an id came back) shows as nobody rather than leaking the id.
const person = (p) => (p && typeof p === 'object' && p.name ? { name: p.name } : null);

// The booking statuses from which a customer sees the technicians' names.
const TECHNICIANS_VISIBLE_STATUSES = ['Approved', 'In Progress', 'Completed'];

// Top-level Booking fields a customer may receive, passed through as they are (they hold nothing internal).
const PASS_THROUGH = [
  '_id', 'bookingId', 'status', 'createdAt', 'updatedAt', 'date', 'time', 'address', 'contactNumber', 'problemDescription',
  'unitTypes', 'brandModel', 'clientSuppliedUnit', 'unitSource', 'unitWaiver', 'unitPurchaseProof', 'cleaningTierAnswers',
  'requestedTechnician',
  'downPaymentPercent', 'downPaymentPaidAmount', 'pricingVersion', 'unitConfirmedAt', 'paymentMode', 'paymentMode2', 'paymentStatus', 'balancePaid',
  'balancePaymentStatus', 'proofFile', 'balanceProofFile', 'referenceNumber', 'balanceReferenceNumber',
  'distanceAdjustment', 'mobilizationFee', 'promo', 'isCommercial', 'vatAmount', 'poNumber', 'paymentTermsDays', 'paymentDueAt',
  'feedback', 'completedAt', 'cancelledAt', 'cancelledBy', 'ownerCancelled', 'cancelReason', 'expiredBySystem', 'startedBySystem', 'startedAt', 'reportSubmitted', 'isBackJob', 'backJobId',
  'service', 'customer', 'warranty', 'priceSnapshot', 'quotationTerms', 'taxInclusive', 'site', 'mayNeedWorks',
];

// Fields built piece by piece below, so only the safe parts leave.
const SHAPED = ['unitDecline', 'technician', 'assignments', 'discount', 'refund', 'rescheduleRequest', 'disruption', 'noShow', 'extensionRequest', 'extensionDays', 'scopeLines', 'units'];

// Booking fields a customer never receives. Together with PASS_THROUGH and SHAPED this must cover every field
// of the Booking model (the test checks it), so a new field cannot reach customers by accident.
const HIDDEN = [
  'technicianInstructions', 'assignmentHistory', 'queueRank', 'serviceAreaCheck', 'approvedAt',
  'reportId', 'report', '__v', 'id', 'paymentEvents', 'needsReassignment', 'paymentCheckAfterCancel',
  // the raw quotation settings; the customer gets the effective terms (quotationTerms) instead
  'quotation',
  // the day-before reminder's bookkeeping (jobs/serviceTomorrowReminderJob.js)
  'serviceReminderSentFor', 'serviceReminderSentAt',
  // evaluator sample data markers (scripts/seedEvaluatorData.js)
  'isEvaluatorSample', 'evaluatorBatch', 'evaluatorKey',
];

function toCustomerView(booking) {
  const b = booking && typeof booking.toObject === 'function' ? booking.toObject() : (booking || {});
  const out = pick(b, PASS_THROUGH);

  if (out.customer && typeof out.customer === 'object') out.customer = pick(out.customer, ['_id', 'name']);

  // What the customer owes right now, worked out on the server (utils/paymentDue.js) so Billing and the booking page agree.
  if (b.service && typeof b.service === 'object') {
    out.paymentDue = paymentDueOf(b);
    out.awaitingUnitConfirmation = unitAwaitingConfirmation(b);
  }

  // The reason the owner gave when a payment proof was rejected, while it is still rejected. (The payment log itself stays hidden.)
  const lastRejection = (track) => [...(Array.isArray(b.paymentEvents) ? b.paymentEvents : [])].reverse().find((e) => e.track === track && e.status === 'rejected');
  if (b.paymentStatus === 'rejected') out.downPaymentRejectionReason = lastRejection('down')?.reason || '';
  if (b.balancePaymentStatus === 'rejected') out.balanceRejectionReason = lastRejection('balance')?.reason || '';

  // The technicians on a Pending booking are only a proposal and can change, so the customer sees them once the booking
  // is Approved (and after). A Cancelled booking shows none.
  const showTechnicians = TECHNICIANS_VISIBLE_STATUSES.includes(b.status);
  if (b.technician !== undefined) out.technician = showTechnicians ? person(b.technician) : null;
  if (b.assignments !== undefined) {
    out.assignments = (showTechnicians ? (b.assignments || []) : []).map((a) => ({
      team: a.team && typeof a.team === 'object' ? { name: a.team.name } : null,
      lead: person(a.lead),
      helper: person(a.helper),
    }));
  }

  if (b.discount) {
    // reviewedBy (the admin who decided) stays out; the reason shown to the customer stays in
    out.discount = pick(b.discount, ['type', 'consentGiven', 'status', 'percent', 'amount', 'dpPaidBeforeApproval', 'rejectionReason', 'requestedAt', 'reviewedAt']);
  }

  // The owner's "cannot supply this unit": the reason and the note are for the customer; who said it is not.
  if (b.unitDecline && b.unitDecline.reason) out.unitDecline = pick(b.unitDecline, ['reason', 'note', 'declinedAt']);

  if (b.refund) {
    out.refund = pick(b.refund, [
      'status', 'isSameDay', 'downPaymentAmount', 'dispatchDeduction', 'dispatchReason', 'refundableAmount', 'computedAmount', 'finalAmount',
      'adjustmentReason', 'receivedConfirmedAt', 'requestedAt', 'processedAt', 'proofFile', 'ownerInitiated', 'reason', 'systemInitiated', 'expired',
    ]);
    if (b.refund.customerFlag) {
      out.refund.customerFlag = pick(b.refund.customerFlag, ['flagged', 'message', 'flaggedAt', 'resolved', 'resolvedAt']);
    }
  }

  // The customer's own no show report: the note and the owner's decision with its reason (who decided stays out).
  if (b.noShow && b.noShow.status && b.noShow.status !== 'None') out.noShow = pick(b.noShow, ['status', 'note', 'reportedAt', 'decidedAt', 'decisionReason']);

  if (b.rescheduleRequest) out.rescheduleRequest = pick(b.rescheduleRequest, ['status', 'requestedDate', 'requestedTime']);

  // The technician's reasons are for the admin; the customer is told the outcome by notification.
  if (b.disruption) out.disruption = pick(b.disruption, ['status', 'rescheduledAt']);
  if (b.extensionRequest) out.extensionRequest = pick(b.extensionRequest, ['status', 'requestedDate', 'requestedTime', 'requestedAt', 'decidedAt']);

  // The unit entries. The unit a customer chose or asked for stays, with its price; who settled a request and the admin's note on a
  // manual price do not. The reason a request was declined stays, because the customer is told it.
  if (Array.isArray(b.units)) {
    out.units = b.units.map((u) => {
      const entry = pick(u, ['_id', 'type', 'quantity', 'brandModel', 'hp']);
      if (u.supplied) {
        entry.supplied = pick(u.supplied, ['source', 'status', 'brand', 'model', 'type', 'hp', 'inverter', 'price', 'declineReason']);
        if (u.supplied.request) entry.supplied.request = pick(u.supplied.request, ['brand', 'type', 'hp', 'notes']);
      }
      return entry;
    });
  }

  // The scope of works as a breakdown: what, how many, the rate and the amount (not which admin added it).
  if (Array.isArray(b.scopeLines)) out.scopeLines = b.scopeLines.map((l) => pick(l, ['kind', 'description', 'quantity', 'unitLabel', 'unitRate', 'amount', 'addedAt']));

  // The extra days an admin approved (no admin id).
  if (Array.isArray(b.extensionDays)) out.extensionDays = b.extensionDays.map((d) => pick(d, ['date', 'time', 'approvedAt']));

  return out;
}

// A back job claim as the customer sees it: not who reviewed it. The free repair visit is a booking, so it goes
// through the same whitelist.
function toCustomerBackJob(backJob) {
  const j = backJob && typeof backJob.toObject === 'function' ? backJob.toObject() : (backJob || {});
  const out = pick(j, [
    '_id', 'backJobId', 'originalBookingId', 'issueDescription', 'warrantyCheck', 'status', 'resultingBookingId', 'reportedAt', 'createdAt', 'updatedAt',
  ]);
  if (j.resultingBooking && typeof j.resultingBooking === 'object') out.resultingBooking = toCustomerView(j.resultingBooking);
  else if (j.resultingBooking !== undefined) out.resultingBooking = j.resultingBooking;
  return out;
}

// A service report as its owning customer sees it. A whitelist: no technician id, email or contact, no internal notes,
// no labor hours, nothing from the admin. `booking` is the booking behind the report, already populated; `names` are
// the display names of the technicians on the job.
function toCustomerReport(report, booking, names = []) {
  const r = report && typeof report.toObject === 'function' ? report.toObject() : (report || {});
  const out = pick(r, ['_id', 'bookingId', 'workSummary', 'partsUsed', 'issueResolution', 'recommendations', 'followUpRequired', 'followUpDate', 'submittedAt']);
  if (r.preExistingIssue) out.preExistingIssue = pick(r.preExistingIssue, ['flagged', 'description']);
  if (r.clientConsent) out.clientConsent = pick(r.clientConsent, ['signedName', 'signedAt', 'signatureDataUrl']);
  // a gated file reference (opened through the signed-link route), never a public address
  if (r.signedFormPhoto) out.signedFormPhoto = r.signedFormPhoto;
  out.serviceDate = booking && booking.date;
  out.technicians = names.filter(Boolean);
  out.bookingDetails = booking ? toCustomerView(booking) : undefined;
  return out;
}

module.exports = { toCustomerView, toCustomerBackJob, toCustomerReport, PASS_THROUGH, SHAPED, HIDDEN };
