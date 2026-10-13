// Run with: npm test (inside server/). A walk-in booking belongs to an active customer account, is never marked paid just
// because an admin made it, and money received in person is recorded on purpose: method, amount, reference, who and when,
// through the same rules and the same record as verifying a proof. The 3-day rule has no admin override. The real routes
// run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = require('../utils/extensionDays');

const { state, post, call, addBooking } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const walkIn = (fields = {}) => post({ customer: 'CUS1', ...fields }, 'ADM1', { role: 'admin' });
const record = (body, as = 'ADM1') => call('PATCH', '/CZ-1/record-payment', as, body, { role: as === 'ADM1' ? 'admin' : 'customer' });
const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }],
  downPaymentPercent: 50, paymentStatus: 'Unpaid', balancePaymentStatus: 'None', ...over,
});

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
    { _id: 'CUS2', role: 'customer', isActive: false, clientType: 'Residential', name: 'Gone Customer' },
    { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
    { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' },
  ],
  services: [cleaning],
}));

// ---- who the booking belongs to
test('a walk-in booking for a technician, an admin, a missing or a deactivated account is refused', async () => {
  for (const customer of ['STF1', 'ADM1', 'NOBODY', 'CUS2']) {
    const res = await walkIn({ customer });
    assert.equal(res.status, 400, customer);
  }
  assert.equal(state.bookings.length, 0);
});

test('a walk-in booking for an active customer is accepted and owned by that customer', async () => {
  const res = await walkIn();
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].customer, 'CUS1');
});

// ---- never paid by being made
test('a walk-in booking with a down payment is Unpaid, not Paid, whatever the method', async () => {
  for (const paymentMode of ['Cash', 'Cheque', 'GCash']) {
    harness.state.bookings.length = 0;
    const res = await walkIn({ paymentMode, downPaymentPercent: 50 });
    assert.equal(res.status, 201, `${paymentMode}: ${JSON.stringify(res.body)}`);
    assert.equal(state.bookings[0].paymentStatus, 'Unpaid', paymentMode);
    assert.equal(state.bookings[0].downPaymentPaidAmount, undefined);
    assert.equal(state.bookings[0].paymentEvents, undefined);
  }
});

test('there is no admin override of the 3-day rule', async () => {
  const res = await walkIn({ date: addDays(manilaTodayKey(), 1) });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /at least 3 days/);
});

// ---- recording a payment
test('recording cash for the down payment verifies it and records who received it, when, how much', async () => {
  booking();
  const res = await record({ track: 'down', method: 'Cash', amount: 1000 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.paymentStatus, 'partially_paid');
  assert.equal(saved.downPaymentPaidAmount, 1000);
  const event = saved.paymentEvents[0];
  assert.deepEqual(
    { track: event.track, status: event.status, amount: event.amount, method: event.method, inPerson: event.inPerson, by: event.by },
    { track: 'down', status: 'recorded', amount: 1000, method: 'Cash', inPerson: true, by: { id: 'ADM1', name: 'Admin One' } },
  );
  assert.ok(event.at);
  assert.deepEqual(state.notes.filter((n) => n.user === 'CUS1').map((n) => n.type), ['payment_verified']);
});

test('a cheque keeps its number; the balance can be recorded after the down payment', async () => {
  booking({ paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const res = await record({ track: 'balance', method: 'Cheque', amount: 1000, reference: ' CHQ-00123 ' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.paymentStatus, 'fully_paid');
  assert.equal(saved.balancePaymentStatus, 'paid');
  assert.equal(saved.paymentEvents[0].reference, 'CHQ-00123');
  assert.equal(saved.paymentEvents[0].method, 'Cheque');
});

test('the balance cannot be recorded before the down payment, and nothing is recorded twice', async () => {
  booking();
  const early = await record({ track: 'balance', method: 'Cash', amount: 1000 });
  assert.equal(early.status, 400);
  assert.match(early.body.message, /down payment before the balance/);
  assert.equal((await record({ track: 'down', method: 'Cash', amount: 1000 })).status, 200);
  const again = await record({ track: 'down', method: 'Cash', amount: 1000 });
  assert.equal(again.status, 400);
  assert.equal(state.bookings[0].paymentEvents.length, 1);
});

test('only a real method, a positive amount and a real track are accepted', async () => {
  booking();
  for (const body of [
    { track: 'down', method: 'Barter', amount: 100 }, { track: 'down', method: 'Cash', amount: 0 }, { track: 'down', method: 'Cash', amount: -5 },
    { track: 'down', method: 'Cash', amount: 'lots' }, { track: 'down', method: 'Cash', amount: 99999999 }, { track: 'both', method: 'Cash', amount: 100 }, {},
  ]) {
    assert.equal((await record(body)).status, 400, JSON.stringify(body));
  }
  assert.equal(state.bookings[0].paymentStatus, 'Unpaid');
});

test('a cancelled booking and a booking with no down payment due cannot have one recorded', async () => {
  booking({ status: 'Cancelled' });
  assert.equal((await record({ track: 'down', method: 'Cash', amount: 100 })).status, 400);
  harness.reset({ users: state.users, services: state.services });
  booking({ downPaymentPercent: 0 });
  assert.equal((await record({ track: 'down', method: 'Cash', amount: 100 })).status, 400);
});

test('only an admin can record a payment, and two recordings at once: one wins', async () => {
  booking();
  assert.equal((await record({ track: 'down', method: 'Cash', amount: 100 }, 'CUS1')).status, 403);
  const results = await Promise.all([record({ track: 'down', method: 'Cash', amount: 1000 }), record({ track: 'down', method: 'Cheque', amount: 1000 })]);
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(state.bookings[0].paymentEvents.length, 1);
});
