// What each audited route records (see utils/audit.js). One place, so the list of what is on the trail is easy to read and
// to check. Each entry is middleware to put right after `auth` on the route. Only successful answers are recorded, and `meta`
// holds ids and small values, never passwords, tokens, files or bank details.
const { audited, audited1 } = require('./audit');

const param = (name) => (req) => req.params[name];
const idOfBody = (req, body) => (body && (body._id || body.id));
const bookingId = param('bookingId');
const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

// ---- bookings
const adminUpdate = audited({
  entityType: 'Booking',
  entityId: bookingId,
  actions: (req) => {
    const b = req.body || {};
    const lines = [];
    if (b.reverse) lines.push({ action: 'payment.reverse', summary: `Reversed the ${b.reverse} payment`, meta: { track: b.reverse, reason: b.reason } });
    else if (b.paymentStatus === 'rejected') lines.push({ action: 'payment.reject', summary: 'Rejected the down payment proof', meta: { track: 'down', reason: b.reason } });
    else if (b.paymentStatus) lines.push({ action: 'payment.verify', summary: 'Verified the down payment', meta: { track: 'down' } });
    if (b.balancePaymentStatus === 'rejected') lines.push({ action: 'payment.reject', summary: 'Rejected the balance proof', meta: { track: 'balance', reason: b.reason } });
    else if (b.balancePaymentStatus) lines.push({ action: 'payment.verify', summary: 'Verified the balance', meta: { track: 'balance' } });
    if (b.status === 'Approved') lines.push({ action: 'booking.approve', summary: 'Approved the booking' });
    if (b.status === 'Cancelled') lines.push({ action: 'booking.cancel', summary: `Cancelled the booking (by ${req.userRole})`, meta: { by: req.userRole } });
    if (b.distanceAdjustment !== undefined || b.mobilizationFee !== undefined) {
      lines.push({ action: 'booking.charges', summary: 'Changed the distance or mobilization charge', meta: { distanceAdjustment: num(b.distanceAdjustment), mobilizationFee: num(b.mobilizationFee) } });
    }
    if (b.technicianInstructions !== undefined) lines.push({ action: 'booking.instructions', summary: 'Changed the instructions for the technicians' });
    return lines;
  },
});
const recordPayment = audited1('payment.record', 'Booking', bookingId,
  (req) => `Recorded a ${req.body && req.body.track} payment received in person`,
  (req) => ({ track: req.body && req.body.track, method: req.body && req.body.method, amount: num(req.body && req.body.amount) }));
const customerCancel = audited1('booking.cancel', 'Booking', bookingId, (req) => `Cancelled the booking (by ${req.userRole})`, (req) => ({ by: req.userRole }));
const rescheduleApprove = audited1('reschedule.approve', 'Booking', bookingId, 'Approved the reschedule request');
const rescheduleDeny = audited1('reschedule.deny', 'Booking', bookingId, 'Denied the reschedule request');
const assign = audited1('booking.assign', 'Booking', bookingId, 'Changed who is assigned (see the assignment history)',
  (req) => ({ pairs: Array.isArray(req.body && req.body.assignments) ? req.body.assignments.length : undefined }));
const discountApprove = audited1('discount.approve', 'Booking', bookingId, 'Approved the Senior/PWD discount');
const discountReject = audited1('discount.reject', 'Booking', bookingId, 'Rejected the Senior/PWD discount', (req) => ({ reason: req.body && req.body.reason }));
const refundProcess = audited1('refund.process', 'Booking', bookingId, 'Marked the refund as sent',
  (req) => ({ dispatchDeduction: num(req.body && req.body.dispatchDeduction), finalAmount: num(req.body && req.body.finalAmount) }));
const refundFlagResolve = audited1('refund.flag.resolve', 'Booking', bookingId, 'Resolved the customer\'s refund flag');
const disruptionReschedule = audited1('disruption.reschedule', 'Booking', bookingId, 'Rescheduled a disrupted job',
  (req) => ({ date: req.body && req.body.date, time: req.body && req.body.time }));
const extensionApprove = audited1('extension.approve', 'Booking', bookingId, 'Approved the extra day');
const extensionDeny = audited1('extension.deny', 'Booking', bookingId, 'Denied the extra day');
const queueMove = audited1('queue.move', 'Booking', bookingId, (req) => `Moved the request ${req.body && req.body.action}`, (req) => ({ action: req.body && req.body.action }));
const unitPurchaseProof = audited1('booking.unit_purchase_proof', 'Booking', bookingId, 'Added the proof of purchase for the unit');

// ---- accounts
const userCreate = audited1('user.create', 'User', idOfBody, 'Created an account', (req) => ({ role: req.body && req.body.role }));
const userUpdate = audited({
  entityType: 'User',
  entityId: param('id'),
  actions: (req) => {
    const b = req.body || {};
    const lines = [{ action: 'user.update', summary: 'Edited the account' }];
    if (b.isActive === true) lines.push({ action: 'user.activate', summary: 'Activated the account' });
    if (b.isActive === false) lines.push({ action: 'user.deactivate', summary: 'Deactivated the account', meta: { confirmed: b.confirmReassign === true } });
    if (b.role !== undefined) lines.push({ action: 'user.role', summary: 'Set the account role', meta: { role: b.role } });
    if (b.agreedPaymentTermsDays !== undefined) lines.push({ action: 'user.payment_terms', summary: 'Set the agreed payment terms', meta: { days: num(b.agreedPaymentTermsDays) } });
    return lines;
  },
});
const userClassification = audited1('user.classification', 'User', param('id'), 'Set the customer classification', (req) => ({ classification: req.body && req.body.classification }));

// ---- configuration
const settingsUpdate = audited1('settings.update', 'PaymentSettings', () => 'default', 'Changed the payment settings',
  (req) => {
    const b = req.body || {};
    return {
      downPaymentPercentages: Array.isArray(b.downPaymentPercentages) ? b.downPaymentPercentages.map(Number) : undefined,
      methods: Array.isArray(b.paymentMethods) ? b.paymentMethods.map((m) => String((m && m.name) || '')) : undefined,
      seniorPwdDiscountPercent: num(b.seniorPwdDiscountPercent),
    };
  });
const promoCreate = audited1('promo.create', 'Promo', idOfBody, 'Created a promotion', (req) => ({ name: req.body && req.body.name }));
const promoUpdate = audited1('promo.update', 'Promo', param('id'), 'Edited a promotion', (req) => ({ name: req.body && req.body.name }));
const promoDelete = audited1('promo.delete', 'Promo', param('id'), 'Deleted a promotion');
const serviceCreate = audited1('service.create', 'Service', idOfBody, 'Created a service', (req) => ({ name: req.body && req.body.name, price: num(req.body && req.body.price) }));
const serviceUpdate = audited1('service.update', 'Service', param('id'), 'Edited a service', (req) => ({ name: req.body && req.body.name, price: num(req.body && req.body.price) }));
const serviceToggle = audited1('service.toggle', 'Service', param('id'), 'Switched a service on or off');
const serviceRemove = audited({
  entityType: 'Service',
  entityId: param('id'),
  actions: (req) => [req.query && req.query.hard === 'true'
    ? { action: 'service.delete', summary: 'Deleted a service for good' }
    : { action: 'service.archive', summary: 'Archived a service' }],
});
const announcementCreate = audited1('announcement.create', 'Announcement', idOfBody, 'Created an announcement', (req) => ({ title: req.body && req.body.title }));
const announcementUpdate = audited1('announcement.update', 'Announcement', param('id'), 'Edited an announcement', (req) => ({ title: req.body && req.body.title }));
const announcementDelete = audited1('announcement.delete', 'Announcement', param('id'), 'Deleted an announcement');
const closureCreate = audited1('closure.create', 'Closure', (req) => req.body && req.body.date, 'Closed a date', (req) => ({ date: req.body && req.body.date, reason: req.body && req.body.reason }));
const closureDelete = audited1('closure.delete', 'Closure', param('date'), 'Opened a closed date again');

// ---- reports and claims
const reportEdit = audited1('report.edit', 'Report', param('id'), 'Edited a service report', (req) => ({ fields: Object.keys(req.body || {}).slice(0, 10) }));
const reportDelete = audited1('report.delete', 'Report', param('id'), 'Deleted a service report', (req) => ({ reason: req.body && req.body.reason }));
const backJobReview = audited1('backjob.review', 'BackJob', param('backJobId'), 'Marked a Not Covered claim as reviewed');

module.exports = {
  adminUpdate, recordPayment, customerCancel, rescheduleApprove, rescheduleDeny, assign, discountApprove, discountReject, refundProcess,
  refundFlagResolve, disruptionReschedule, extensionApprove, extensionDeny, queueMove, unitPurchaseProof, userCreate, userUpdate,
  userClassification, settingsUpdate, promoCreate, promoUpdate, promoDelete, serviceCreate, serviceUpdate, serviceToggle, serviceRemove,
  announcementCreate, announcementUpdate, announcementDelete, closureCreate, closureDelete, reportEdit, reportDelete, backJobReview,
};
