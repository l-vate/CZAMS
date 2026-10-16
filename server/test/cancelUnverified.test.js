// Run with: npm test (inside server/). A booking cancelled while its down payment proof is still To Verify does not open a refund for
// an amount nobody has checked. Every admin is told to verify or reject the proof first. A verified proof then opens the refund
// (with the same-day rule); a rejected one means nothing was paid and no refund opens. Nothing else on that cancelled booking can be
// changed. A verified payment still opens the refund straight away. The real routes run; only the database is replaced.
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

test('cancelling by the customer with the proof still To Verify opens no refund, flags the booking and tells every admin once', async () => {
  const b = booking();
  const res = await customerCancel();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.refund.status, 'None', 'no refund for an unverified amount');
  assert.equal(b.paymentCheckAfterCancel, true);
  assert.equal(b.paymentStatus, 'to_verify');
  assert.deepEqual(toAdmins('payment_submitted'), ['ADM1', 'ADM2']);
  assert.match(state.notes.find((n) => n.type === 'payment_submitted').message, /Verify or reject the proof/);
  assert.deepEqual(toAdmins('refund_requested'), []);
  assert.deepEqual(toAdmins('booking_cancelled'), []);
});

test('cancelling by an admin does the same', async () => {
  const b = booking({ status: 'Pending' });
  assert.equal((await admin({ status: 'Cancelled' })).status, 200);
  assert.equal(b.refund.status, 'None');
  assert.equal(b.paymentCheckAfterCancel, true);
  assert.deepEqual(toAdmins('payment_submitted'), ['ADM1', 'ADM2']);
});

test('verifying the proof afterwards opens the refund, at the amount verified, and tells the admins and the customer', async () => {
  const b = booking({ date: goodDate(7) });
  await customerCancel();
  const res = await admin({ paymentStatus: 'partially_paid' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.paymentStatus, 'partially_paid');
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.downPaymentAmount, 1000, '50% of 2,000, as verified');
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.paymentCheckAfterCancel, false);
  assert.equal(b.status, 'Cancelled');
  assert.deepEqual(toAdmins('refund_requested'), ['ADM1', 'ADM2']);
  assert.equal(state.notes.filter((n) => n.user === 'CUS1' && n.type === 'payment_verified').length, 1);
  assert.equal(b.paymentEvents[0].status, 'verified');
});

test('a same-day cancellation opens a same-day refund once the proof is verified', async () => {
  const b = booking({ date: manilaTodayKey() });
  await customerCancel();
  await admin({ paymentStatus: 'partially_paid' });
  assert.equal(b.refund.isSameDay, true);
  assert.equal(b.refund.refundableAmount, undefined, 'the deduction is entered when the refund is processed');
});

test('rejecting the proof afterwards opens no refund, the booking stops waiting, and the customer is not asked for a new proof', async () => {
  const b = booking();
  await customerCancel();
  const res = await admin({ paymentStatus: 'rejected', reason: 'The reference number does not match' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.refund.status, 'None');
  assert.equal(b.paymentCheckAfterCancel, false);
  assert.equal(b.paymentStatus, 'rejected');
  const note = state.notes.find((n) => n.user === 'CUS1' && n.type === 'payment_rejected');
  assert.match(note.message, /could not be verified: The reference number does not match\./);
  assert.equal(note.message.includes('upload a new proof'), false);
  assert.deepEqual(toAdmins('refund_requested'), []);
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
  assert.deepEqual(toAdmins('booking_cancelled'), ['ADM1', 'ADM2']);
});

test('a customer cannot use the admin route to check their own proof', async () => {
  booking();
  await customerCancel();
  assert.equal((await call('PATCH', '/CZ-1/admin-update', 'CUS1', { paymentStatus: 'partially_paid' })).status, 403);
});
