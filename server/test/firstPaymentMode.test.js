// Run with: npm test (inside server/). A customer pays online by GCash or Bank Transfer only, for the first and the second payment,
// whatever the form shows. An admin recording a walk-in may still use any mode. The real route runs; only the database is
// replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { firstPaymentModeProblem } = require('../utils/paymentGuards');

const { state, post, goodDate } = harness;

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
    assert.match(res.body.message, /GCash or Bank Transfer only/);
  }
  assert.equal(state.bookings.length, 0);
});

test('a customer booking with GCash or Bank Transfer is accepted', async () => {
  assert.equal((await post({ paymentMode: 'GCash' })).status, 201);
  assert.equal((await post({ paymentMode: 'Bank Transfer', date: goodDate(8) })).status, 201); // another day: the same booking twice is refused
});

test('the second payment is online only too: Cash or Cheque as the second payment mode is refused, Bank Transfer is fine', async () => {
  for (const paymentMode2 of ['Cash', 'Cheque', 'cheque ']) {
    const res = await post({ paymentMode: 'GCash', paymentMode2 });
    assert.equal(res.status, 400, paymentMode2);
    assert.match(res.body.message, /GCash or Bank Transfer only/);
  }
  const ok = await post({ paymentMode: 'GCash', paymentMode2: 'Bank Transfer' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

test('an admin walk-in booking may record a cash or cheque first payment', async () => {
  for (const [i, paymentMode] of ['Cash', 'Cheque'].entries()) {
    const res = await post({ paymentMode, customer: 'CUS1', date: goodDate(7 + i) }, 'ADM1', { role: 'admin' }); // another day each: the same booking twice is refused
    assert.equal(res.status, 201, `${paymentMode}: ${JSON.stringify(res.body)}`);
  }
});
