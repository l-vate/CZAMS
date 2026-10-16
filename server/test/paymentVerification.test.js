// Run with: npm test (inside server/). Verifying a payment follows rules and leaves a record: only allowed values, a proof
// must exist, the balance waits for the down payment, rejecting and reversing need a reason, Fully Paid is worked out and
// never typed, a cancelled booking cannot be changed, and two admins acting at once cannot both succeed. The real route
// runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, call, addBooking } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }],
  downPaymentPercent: 50, paymentStatus: 'to_verify', proofFile: '/uploads/proofs/a.png', balancePaymentStatus: 'None', ...over,
});
const update = (body, as = 'ADM1') => call('PATCH', '/CZ-1/admin-update', as, body, { role: as === 'ADM1' || as === 'ADM2' ? 'admin' : 'customer' });
const forCustomer = () => state.notes.filter((n) => n.user === 'CUS1');

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer One' },
    { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
    { _id: 'ADM2', role: 'admin', isActive: true, name: 'Admin Two' },
  ],
  services: [cleaning],
}));

test('a value that is not a payment status is a 400, for either payment', async () => {
  booking();
  for (const body of [{ paymentStatus: 'bogus' }, { paymentStatus: 7 }, { paymentStatus: {} }, { balancePaymentStatus: 'bogus' }, { balancePaymentStatus: ['paid'] }]) {
    const res = await update(body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(state.bookings[0].paymentStatus, 'to_verify');
});

test('verifying records who, when, which payment, the amount and the outcome', async () => {
  booking();
  const res = await update({ paymentStatus: 'partially_paid' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.paymentStatus, 'partially_paid');
  assert.equal(saved.downPaymentPaidAmount, 1000, '50% of 2,000');
  assert.equal(saved.paymentEvents.length, 1);
  const event = saved.paymentEvents[0];
  assert.deepEqual({ track: event.track, status: event.status, amount: event.amount, by: event.by }, { track: 'down', status: 'verified', amount: 1000, by: { id: 'ADM1', name: 'Admin One' } });
  assert.ok(event.at);
  assert.deepEqual(forCustomer().map((n) => n.type), ['payment_verified']);
});

test('Fully Paid is worked out: asking for it on a 50% down payment gives Partially Paid; a 100% down payment is Fully Paid', async () => {
  booking();
  await update({ paymentStatus: 'fully_paid' });
  assert.equal(state.bookings[0].paymentStatus, 'partially_paid');
  harness.reset({ users: state.users, services: state.services });
  booking({ downPaymentPercent: 100 });
  await update({ paymentStatus: 'partially_paid' });
  assert.equal(state.bookings[0].paymentStatus, 'fully_paid');
});

test('a state cannot be skipped: nothing sent yet, a rejected payment, or an already verified one cannot be verified again', async () => {
  for (const paymentStatus of ['Unpaid', 'rejected', 'partially_paid', 'fully_paid']) {
    harness.reset({ users: state.users, services: state.services });
    booking({ paymentStatus, proofFile: undefined });
    const res = await update({ paymentStatus: 'partially_paid' });
    assert.equal(res.status, 400, paymentStatus);
    assert.equal(state.bookings[0].paymentEvents, undefined, 'nothing recorded');
  }
});

test('there must be a proof to verify', async () => {
  booking({ proofFile: undefined });
  const res = await update({ paymentStatus: 'partially_paid' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /no proof of payment/);
  assert.equal(state.bookings[0].paymentStatus, 'to_verify');
});

test('rejecting needs a reason, clears the proof, is recorded, and the customer is told the reason', async () => {
  booking();
  assert.equal((await update({ paymentStatus: 'rejected' })).status, 400);
  assert.equal((await update({ paymentStatus: 'rejected', reason: 'ab' })).status, 400);
  const res = await update({ paymentStatus: 'rejected', reason: 'The reference number does not match' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.paymentStatus, 'rejected');
  assert.equal(saved.proofFile, undefined);
  assert.equal(saved.paymentEvents[0].status, 'rejected');
  assert.equal(saved.paymentEvents[0].reason, 'The reference number does not match');
  assert.match(forCustomer()[0].message, /reference number does not match/);
});

test('the balance cannot be verified before the down payment, or without its proof', async () => {
  booking({ paymentStatus: 'to_verify', balancePaymentStatus: 'to_verify', balanceProofFile: '/uploads/proofs/b.png' });
  const early = await update({ balancePaymentStatus: 'paid' });
  assert.equal(early.status, 400);
  assert.match(early.body.message, /down payment before the balance/);

  harness.reset({ users: state.users, services: state.services });
  booking({ paymentStatus: 'partially_paid', balancePaymentStatus: 'to_verify', balanceProofFile: undefined });
  const noProof = await update({ balancePaymentStatus: 'paid' });
  assert.equal(noProof.status, 400);
  assert.match(noProof.body.message, /no proof of payment/);
});

test('verifying the balance records it and makes the booking Fully Paid; balancePaid can no longer be sent', async () => {
  booking({ paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000, balancePaymentStatus: 'to_verify', balanceProofFile: '/uploads/proofs/b.png' });
  const forged = await update({ balancePaid: true });
  assert.equal(forged.status, 400);
  assert.match(forged.body.message, /Fully Paid is worked out/);
  assert.equal(state.bookings[0].paymentStatus, 'partially_paid');

  const res = await update({ balancePaymentStatus: 'paid' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.paymentStatus, 'fully_paid');
  assert.equal(saved.balancePaymentStatus, 'paid');
  assert.deepEqual({ track: saved.paymentEvents[0].track, status: saved.paymentEvents[0].status, amount: saved.paymentEvents[0].amount }, { track: 'balance', status: 'verified', amount: 1000 });
});

test('two admins verifying at the same moment: one succeeds, the other is refused, and the customer is told once', async () => {
  booking();
  const results = await Promise.all([update({ paymentStatus: 'partially_paid' }, 'ADM1'), update({ paymentStatus: 'partially_paid' }, 'ADM2')]);
  const codes = results.map((r) => r.status).sort();
  assert.equal(codes.filter((c) => c === 200).length, 1, JSON.stringify(codes));
  assert.ok(codes.every((c) => [200, 400, 409].includes(c)));
  assert.equal(state.bookings[0].paymentEvents.length, 1, 'recorded once');
  assert.equal(forCustomer().filter((n) => n.type === 'payment_verified').length, 1, 'told once');
});

test('the conditional update itself refuses a booking whose status changed under it', async () => {
  const { commitPayment, planPaymentChange } = require('../utils/paymentVerification');
  const Booking = require('../models/Booking');
  const doc = booking();
  const { plan } = planPaymentChange(doc, { paymentStatus: 'partially_paid' });
  doc.paymentStatus = 'rejected'; // someone else got there first
  const committed = await commitPayment(Booking, doc, plan, { id: 'ADM2', name: 'Admin Two' });
  assert.equal(committed, null);
});

test('a cancelled booking cannot have its payment changed', async () => {
  booking({ status: 'Cancelled' });
  const res = await update({ paymentStatus: 'partially_paid' });
  assert.equal(res.status, 400);
  assert.equal(state.bookings[0].paymentStatus, 'to_verify');
});

test('reversing a verified payment needs a reason, is recorded, and goes back to checking; the balance is reversed first', async () => {
  booking({ paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  assert.equal((await update({ reverse: 'down' })).status, 400, 'no reason');
  const res = await update({ reverse: 'down', reason: 'Verified the wrong booking' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(state.bookings[0].paymentStatus, 'to_verify');
  assert.equal(state.bookings[0].downPaymentPaidAmount, undefined);
  assert.equal(state.bookings[0].paymentEvents[0].status, 'reversed');
  assert.equal(state.bookings[0].paymentEvents[0].reason, 'Verified the wrong booking');

  harness.reset({ users: state.users, services: state.services });
  booking({ paymentStatus: 'fully_paid', balancePaymentStatus: 'paid', balancePaid: true, balanceProofFile: '/uploads/proofs/b.png' });
  assert.equal((await update({ reverse: 'down', reason: 'Wrong one' })).status, 400, 'balance first');
  assert.equal((await update({ reverse: 'balance', reason: 'Wrong one' })).status, 200);
  assert.equal(state.bookings[0].balancePaymentStatus, 'to_verify');
  assert.equal(state.bookings[0].paymentStatus, 'partially_paid');
  assert.equal(state.bookings[0].balancePaid, false);
});

test('only one payment is changed per request, and only an admin can call the route', async () => {
  booking({ balancePaymentStatus: 'to_verify', balanceProofFile: '/uploads/proofs/b.png' });
  assert.equal((await update({ paymentStatus: 'partially_paid', balancePaymentStatus: 'paid' })).status, 400);
  assert.equal((await update({ paymentStatus: 'partially_paid' }, 'CUS1')).status, 403);
  assert.equal(state.bookings[0].paymentStatus, 'to_verify');
});
