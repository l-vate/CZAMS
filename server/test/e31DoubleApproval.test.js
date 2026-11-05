// Run with: npm test (inside server/). E31: approving a payment that is already verified (a stale screen, a second tab, a second admin) is refused with
// a clear message saying who verified it and when, and writes no second payment line, audit line or notification. The real route runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, call, addBooking } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }],
  downPaymentPercent: 50, paymentStatus: 'to_verify', proofFile: '/uploads/proofs/a.png', balancePaymentStatus: 'None', ...over,
});
const update = (body, as = 'ADM1') => call('PATCH', '/CZ-1/admin-update', as, body, { role: 'admin' });
const customerNotes = () => state.notes.filter((n) => n.user === 'CUS1');

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

test('a second approval of a verified down payment is refused with who and when, and changes nothing', async () => {
  booking();
  const first = await update({ paymentStatus: 'partially_paid' }, 'ADM1');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const before = { events: state.bookings[0].paymentEvents.length, audits: state.audits.length, notes: customerNotes().length, status: state.bookings[0].paymentStatus };
  assert.equal(before.events, 1);
  assert.ok(before.audits >= 1, 'the first approval is on the audit log');

  const second = await update({ paymentStatus: 'partially_paid' }, 'ADM2');
  assert.equal(second.status, 409);
  assert.match(second.body.message, /^This down payment was already verified by Admin One on .+\. Nothing was changed\.$/);
  assert.equal(state.bookings[0].paymentEvents.length, before.events, 'no second payment line');
  assert.equal(state.audits.length, before.audits, 'no second audit line');
  assert.equal(customerNotes().length, before.notes, 'no second notification');
  assert.equal(state.bookings[0].paymentStatus, before.status);

  // the other verified value (a stale screen that asks for Fully Paid) is the same refusal
  const other = await update({ paymentStatus: 'fully_paid' }, 'ADM2');
  assert.equal(other.status, 409);
  assert.equal(state.audits.length, before.audits);
});

test('a second approval of a verified balance is refused the same way', async () => {
  booking({ paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000, balancePaymentStatus: 'to_verify', balanceProofFile: '/uploads/proofs/b.png' });
  assert.equal((await update({ balancePaymentStatus: 'paid' })).status, 200);
  const before = { events: state.bookings[0].paymentEvents.length, audits: state.audits.length, notes: customerNotes().length };
  const again = await update({ balancePaymentStatus: 'paid' }, 'ADM2');
  assert.equal(again.status, 409);
  assert.match(again.body.message, /^This balance payment was already verified by Admin One on .+\. Nothing was changed\.$/);
  assert.deepEqual({ events: state.bookings[0].paymentEvents.length, audits: state.audits.length, notes: customerNotes().length }, before);
});

test('rejecting a payment that is already verified follows the existing rule: refused, reverse it first with a reason', async () => {
  booking({ paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const res = await update({ paymentStatus: 'rejected', reason: 'Wrong reference number' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Only a payment that is waiting to be verified can be verified or rejected/);
  assert.equal(state.bookings[0].paymentStatus, 'partially_paid');
  assert.equal(state.audits.length, 0);
});
