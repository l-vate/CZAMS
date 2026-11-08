// Run with: npm test (inside server/). The cancellation refund rule (E34): a customer who cancels a Pending or Approved booking gets the whole verified down
// payment back, on any date, and nothing the client sends changes that. Only an admin cancelling for a reason that keeps part of it can deduct (see
// e34CancelLock.test.js). The real routes run; only the database is replaced.
const test = require('node:test');
const { REAL_PNG } = require('./helpers/images');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const harness = require('./helpers/createBooking');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = require('../utils/extensionDays');
const { resolveRefundAmounts } = require('../utils/refundAmounts');

const { state, call, addBooking, goodDate, base } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const people = () => [{ _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer' }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }];
const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }], date: goodDate(7), time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000, balancePaymentStatus: 'None', refund: { status: 'None' }, ...over,
});
const cancel = (body) => call('PATCH', '/CZ-1/cancel', 'CUS1', body);

// the admin sends the refund as a form with a proof file, the way the screen does
async function processRefund(fields) {
  const token = jwt.sign({ id: 'ADM1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const form = new FormData();
  form.append('proof', new Blob([REAL_PNG], { type: 'image/png' }), 'proof.png');
  Object.entries(fields).forEach(([k, v]) => form.append(k, String(v)));
  const res = await fetch(`${base()}/api/bookings/CZ-1/refund`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users: people(), services: [cleaning] }));

test('the fee rules on their own: required, 0 is fine, never above the down payment, a short reason is kept', () => {
  const r = (over) => resolveRefundAmounts({ amountPaid: 1000, isSameDay: true, ...over });
  assert.equal(r({}).problem.status, 400, 'required');
  assert.equal(r({ dispatchDeduction: -1 }).problem.status, 400, 'not below 0');
  assert.equal(r({ dispatchDeduction: 1001 }).problem.status, 400, 'not above the down payment');
  assert.match(r({ dispatchDeduction: 1001 }).problem.message, /cannot be more than the ₱1,000.00 down payment/);
  assert.equal(r({ dispatchDeduction: 1000 }).values.finalAmount, 0, 'the whole down payment is the most it can be');
  assert.equal(r({ dispatchDeduction: 0 }).values.finalAmount, 1000);
  assert.equal(r({ dispatchDeduction: 300, dispatchReason: '  Crew was on the way ' }).values.dispatchReason, 'Crew was on the way');
  assert.equal(r({ dispatchDeduction: 300, dispatchReason: 'x'.repeat(201) }).problem.status, 400);
});

test('before the booked date: the whole verified down payment is refundable, no fee asked', async () => {
  const b = booking();
  assert.equal((await cancel()).status, 200);
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.refund.downPaymentAmount, 1000);
  assert.equal(b.refund.refundableAmount, 1000);
  const done = await processRefund({});
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.refund.status, 'Processed');
});

test('a customer who cancels on the booked date still gets the whole down payment back: no date rule, no fee (E34)', async () => {
  const b = booking({ date: manilaTodayKey() });
  assert.equal((await cancel()).status, 200);
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.refund.dispatchDeduction, 0);
  assert.equal(b.refund.refundableAmount, 1000);
  const done = await processRefund({});
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.refund.status, 'Processed');
});

test('a date sent by the client changes nothing: the refund is the whole down payment either way', async () => {
  const b = booking({ date: goodDate(7) });
  const res = await cancel({ date: goodDate(7), today: goodDate(7), isSameDay: true, cancelledAt: '2000-01-01' });
  assert.equal(res.status, 200);
  assert.equal(b.refund.isSameDay, false, 'a client claiming it is the booked day does not make it so');
  assert.equal(b.refund.refundableAmount, 1000);

  harness.reset({ users: people(), services: [cleaning] });
  const today = booking({ date: manilaTodayKey() });
  await cancel({ isSameDay: false, today: goodDate(30), dispatchDeduction: 500, cancelDeduction: 500, cancelKind: 'customer_unavailable' });
  assert.equal(today.refund.isSameDay, false);
  assert.equal(today.refund.dispatchDeduction, 0, 'a customer cannot ask for, or be given, a deduction');
  assert.equal(today.refund.refundableAmount, 1000);
  assert.equal(state.bookings.length, 1);
});

test('no verified down payment: nothing to refund, the behavior is unchanged', async () => {
  const b = booking({ date: manilaTodayKey(), paymentStatus: 'Unpaid', downPaymentPaidAmount: undefined });
  assert.equal((await cancel()).status, 200);
  assert.equal(b.refund.status, 'None');
});

test('the refund is audited with the fee and the reason', () => {
  const src = fs.readFileSync(require.resolve('../utils/auditSpecs'), 'utf8');
  assert.match(src, /transportationFee/);
  assert.match(src, /feeReason/);
});

// ---- the booked day, the day after and several days after (an Approved booking is still the customer's to cancel)
const daysFromToday = (n) => addDays(manilaTodayKey(), n);

test('the day before the booked date: the whole down payment is refundable, no fee asked', async () => {
  const b = booking({ date: daysFromToday(1) });
  assert.equal((await cancel()).status, 200);
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.refund.refundableAmount, 1000);
});

test('the booked day, the day after and several days after: still the whole down payment, nothing to enter at refund review', async () => {
  for (const offset of [0, -1, -3, -10]) {
    harness.reset({ users: people(), services: [cleaning] });
    const b = booking({ date: daysFromToday(offset) });
    assert.equal((await cancel()).status, 200, `offset ${offset}`);
    assert.equal(b.refund.status, 'Pending', `offset ${offset}`);
    assert.equal(b.refund.isSameDay, false, `offset ${offset}`);
    assert.equal(b.refund.refundableAmount, 1000, `offset ${offset}`);
    const done = await processRefund({});
    assert.equal(done.status, 200, `offset ${offset}: ${JSON.stringify(done.body)}`);
    assert.equal(b.refund.refundableAmount, 1000, `offset ${offset}`);
  }
});

test('an older refund that was flagged for a late cancellation still asks for its fee when it is processed (records made before E34)', async () => {
  const b = booking({ refund: { status: 'Pending', isSameDay: true, downPaymentAmount: 1000 }, status: 'Cancelled', cancelledBy: 'customer' });
  const missing = await processRefund({});
  assert.equal(missing.status, 400);
  assert.match(missing.body.message, /on or after the booked date/);
  const done = await processRefund({ dispatchDeduction: 350, dispatchReason: 'Fuel and the crew trip' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(b.refund.refundableAmount, 650);
  assert.equal(b.refund.dispatchDeduction, 350);
});

test('a deduction decided when the booking was cancelled is the starting point when the refund is processed', () => {
  const r = resolveRefundAmounts({ amountPaid: 1000, fixedDeduction: 300 });
  assert.equal(r.problem, null);
  assert.equal(r.values.computedAmount, 700);
  assert.equal(r.values.finalAmount, 700);
  assert.equal(r.values.adjusted, false);
  const adjusted = resolveRefundAmounts({ amountPaid: 1000, fixedDeduction: 300, finalAmount: 800, reason: 'Goodwill after a call' });
  assert.equal(adjusted.values.finalAmount, 800);
  assert.equal(adjusted.values.adjusted, true);
  assert.equal(resolveRefundAmounts({ amountPaid: 1000, fixedDeduction: 5000 }).values.finalAmount, 0, 'never more than was paid');
});
