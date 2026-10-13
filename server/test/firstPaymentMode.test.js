// Run with: npm test (inside server/). The first payment a customer makes through the system cannot be Cash or Cheque,
// whatever the form shows. An admin recording a walk-in may still use them. The real route runs; only the database is
// replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { firstPaymentModeProblem } = require('../utils/paymentGuards');

const { state, post } = harness;

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }, { _id: 'ADM1', role: 'admin', isActive: true }],
  services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
}));

test('the rule on its own: Cash and Cheque are refused in any spelling, GCash and Bank Transfer are not', () => {
  ['Cash', 'cash', ' CASH ', 'Cheque', 'cheque'].forEach((m) => assert.equal(firstPaymentModeProblem(m).status, 400, m));
  ['GCash', 'Bank Transfer', '', undefined].forEach((m) => assert.equal(firstPaymentModeProblem(m), null, String(m)));
});

test('a customer booking with Cash or Cheque as the first payment is refused and nothing is saved', async () => {
  for (const paymentMode of ['Cash', 'Cheque', 'cash']) {
    const res = await post({ paymentMode });
    assert.equal(res.status, 400, paymentMode);
    assert.match(res.body.message, /Cash and cheque cannot be used for the first payment/);
  }
  assert.equal(state.bookings.length, 0);
});

test('a customer booking with GCash or Bank Transfer is accepted', async () => {
  assert.equal((await post({ paymentMode: 'GCash' })).status, 201);
  assert.equal((await post({ paymentMode: 'Bank Transfer' })).status, 201);
});

test('the second payment (the balance) may be cash or cheque, paid at the shop', async () => {
  const res = await post({ paymentMode: 'GCash', paymentMode2: 'Cash' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

test('an admin walk-in booking may record a cash or cheque first payment', async () => {
  for (const paymentMode of ['Cash', 'Cheque']) {
    const res = await post({ paymentMode, customer: 'CUS1' }, 'ADM1', { role: 'admin' });
    assert.equal(res.status, 201, `${paymentMode}: ${JSON.stringify(res.body)}`);
  }
});
