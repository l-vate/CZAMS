// Run with: npm test (inside server/). A booking cancelled while its down payment proof is still To Verify opens a refund request that is marked
// paymentUnverified: the customer can ask for the refund at once, but it is not paid out until the proof is verified. Every admin is told to
// check the payment. A verified proof lets the request go ahead (with the same-day rule); a rejected proof, or the admin's own rejection, means
// the payment never came through and the refund is rejected with that reason. Nothing else on that cancelled booking can be changed. A verified
// payment still opens the refund straight away. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { manilaTodayKey } = require('../utils/timeBlocks');

const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const toAdmins = (type) => state.notes.filter((n) => n.type === type).map((n) => n.user).sort();
const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }], date: goodDate(7), time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'to_verify', proofFile: '/uploads/proofs/a.png', balancePaymentStatus: 'None', refund: { status: 'None' }, ...over,
});
const customerCancel = () => call('PATCH', '/CZ-1/cancel', 'CUS1');
const admin = (body) => call('PATCH', '/CZ-1/admin-update', 'ADM1', body, { role: 'admin' });

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [{ _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer' }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' }, { _id: 'ADM2', role: 'admin', isActive: true, name: 'Admin Two' }],
  services: [cleaning],
}));

test('cancelling by the customer with the proof still To Verify opens a refund request marked unverified and tells every admin once', async () => {
  const b = booking();
  const res = await customerCancel();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.refund.status, 'Pending', 'the customer can ask for the refund at once');
  assert.equal(b.refund.paymentUnverified, true);
  assert.equal(b.refund.downPaymentAmount, 1000);
  assert.equal(b.paymentCheckAfterCancel, true);
  assert.equal(b.paymentStatus, 'to_verify');
  assert.deepEqual(toAdmins('refund_requested'), ['ADM1', 'ADM2']);
  assert.match(state.notes.find((n) => n.type === 'refund_requested').message, /has not been verified yet/);
  assert.deepEqual(toAdmins('booking_cancelled'), ['CUS1']);
});

test('cancelling by an admin does the same', async () => {
  const b = booking({ status: 'Pending' });
  assert.equal((await admin({ status: 'Cancelled' })).status, 200);
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.paymentUnverified, true);
  assert.equal(b.paymentCheckAfterCancel, true);
  assert.deepEqual(toAdmins('refund_requested'), ['ADM1', 'ADM2']);
});

test('verifying the proof afterwards lets the refund request go ahead and tells the admins and the customer', async () => {
  const b = booking({ date: goodDate(7) });
  await customerCancel();
  const res = await admin({ paymentStatus: 'partially_paid' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.paymentStatus, 'partially_paid');
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.paymentUnverified, false, 'verified now');
  assert.equal(b.refund.downPaymentAmount, 1000, '50% of 2,000, as verified');
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.paymentCheckAfterCancel, false);
  assert.equal(b.status, 'Cancelled');
  assert.equal(toAdmins('refund_requested').length >= 2, true, 'the admins are told again that it is ready');
  assert.equal(state.notes.filter((n) => n.user === 'CUS1' && n.type === 'payment_verified').length, 1);
  assert.equal(b.paymentEvents[0].status, 'verified');
});

test('a same-day cancellation is a same-day refund, ready once the proof is verified', async () => {
  const b = booking({ date: manilaTodayKey() });
  await customerCancel();
  assert.equal(b.refund.isSameDay, true);
  await admin({ paymentStatus: 'partially_paid' });
  assert.equal(b.refund.isSameDay, true);
  assert.equal(b.refund.refundableAmount, undefined, 'the deduction is entered when the refund is processed');
});

test('rejecting the proof afterwards rejects the refund request, the booking stops waiting, and the customer is not asked for a new proof', async () => {
  const b = booking();
  await customerCancel();
  const res = await admin({ paymentStatus: 'rejected', reason: 'The reference number does not match' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.refund.status, 'Rejected');
  assert.match(b.refund.rejectionReason, /payment did not go through/);
  assert.equal(b.paymentCheckAfterCancel, false);
  assert.equal(b.paymentStatus, 'rejected');
  const note = state.notes.find((n) => n.user === 'CUS1' && n.type === 'payment_rejected');
  assert.match(note.message, /could not be verified: The reference number does not match\./);
  assert.equal(note.message.includes('upload a new proof'), false);
  assert.equal(state.notes.filter((n) => n.user === 'CUS1' && n.type === 'refund_rejected').length, 1, 'the customer is told the refund was not approved');
});

test('the admin can reject an unverified refund with a reason; it cannot be paid out while unverified', async () => {
  const b = booking();
  await customerCancel();
  const process = await call('PATCH', '/CZ-1/refund', 'ADM1', {}, { role: 'admin' });
  assert.equal(process.status, 400);
  assert.match(process.body.message, /not been verified yet/);
  assert.equal((await call('PATCH', '/CZ-1/refund/reject', 'ADM1', { reason: 'x' }, { role: 'admin' })).status, 400, 'a reason is needed');
  const res = await call('PATCH', '/CZ-1/refund/reject', 'ADM1', { reason: 'The payment did not come through' }, { role: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.refund.status, 'Rejected');
  assert.equal(b.refund.rejectionReason, 'The payment did not come through');
  assert.equal(b.paymentCheckAfterCancel, false);
  const note = state.notes.find((n) => n.user === 'CUS1' && n.type === 'refund_rejected');
  assert.match(note.message, /was not approved: The payment did not come through\./);
  assert.equal((await call('PATCH', '/CZ-1/refund/reject', 'ADM1', { reason: 'again' }, { role: 'admin' })).status, 400, 'only a pending refund can be rejected');
});

test('on that cancelled booking nothing else can be changed, and once checked it is closed again', async () => {
  const b = booking();
  await customerCancel();
  for (const body of [{ status: 'Approved' }, { distanceAdjustment: 100 }, { technicianInstructions: 'x' }, { paymentStatus: 'partially_paid', distanceAdjustment: 5 }, { balancePaymentStatus: 'paid' }]) {
    assert.equal((await admin(body)).status, 400, JSON.stringify(body));
  }
  assert.equal(b.paymentStatus, 'to_verify');
  await admin({ paymentStatus: 'partially_paid' });
  assert.equal((await admin({ paymentStatus: 'rejected', reason: 'again' })).status, 400, 'no longer waiting, so no further change');
});

test('a booking cancelled with a verified payment opens the refund straight away; with nothing paid there is no refund and no waiting', async () => {
  const verified = booking({ paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  await customerCancel();
  assert.equal(verified.refund.status, 'Pending');
  assert.ok(!verified.paymentCheckAfterCancel, 'a verified payment does not wait');
  assert.deepEqual(toAdmins('refund_requested'), ['ADM1', 'ADM2']);

  harness.reset({ users: state.users, services: state.services });
  const unpaid = booking({ paymentStatus: 'Unpaid', proofFile: undefined });
  await customerCancel();
  assert.equal(unpaid.refund.status, 'None');
  assert.ok(!unpaid.paymentCheckAfterCancel, 'nothing paid does not wait');
  assert.deepEqual(toAdmins('booking_cancelled'), ['ADM1', 'ADM2', 'CUS1'], 'both admins, and the customer gets a confirmation');
});

test('a customer cannot use the admin route to check their own proof', async () => {
  booking();
  await customerCancel();
  assert.equal((await call('PATCH', '/CZ-1/admin-update', 'CUS1', { paymentStatus: 'partially_paid' })).status, 403);
});
