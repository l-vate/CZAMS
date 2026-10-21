// Run with: npm test (inside server/). The cancellation refund rule: cancelling before the booked date refunds the whole verified down
// payment; cancelling on or after the booked date (the booked day, a day after, several days after) refunds it minus a transportation fee the admin enters (0 up to the down payment). The day is
// worked out on the server in Manila time and nothing the client sends changes it. The real routes run; only the database is replaced.
const test = require('node:test');
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
  form.append('proof', new Blob([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)], { type: 'image/png' }), 'proof.png');
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
  assert.match(r({ dispatchDeduction: 1001 }).problem.message, /cannot be more than the ₱1,000 down payment/);
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

test('on the booked date: nothing is refundable until the admin enters the fee, and the fee is required', async () => {
  const b = booking({ date: manilaTodayKey() });
  assert.equal((await cancel()).status, 200);
  assert.equal(b.refund.isSameDay, true);
  assert.equal(b.refund.refundableAmount, undefined);
  const missing = await processRefund({});
  assert.equal(missing.status, 400);
  assert.match(missing.body.message, /transportation fee is required/);
  assert.equal(b.refund.status, 'Pending');
});

test('on the booked date with a fee of 0 (the crew had not left): the whole down payment goes back', async () => {
  const b = booking({ date: manilaTodayKey() });
  await cancel();
  const done = await processRefund({ dispatchDeduction: 0, dispatchReason: 'The crew had not left' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.refund.dispatchDeduction, 0);
  assert.equal(b.refund.dispatchReason, 'The crew had not left');
});

test('on the booked date with a normal fee: the refund is the down payment minus the fee, and the fee and reason are on the record', async () => {
  const b = booking({ date: manilaTodayKey() });
  await cancel();
  const done = await processRefund({ dispatchDeduction: 350, dispatchReason: 'Fuel and the crew trip' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(b.refund.refundableAmount, 650);
  assert.equal(b.refund.computedAmount, 1000);
  assert.equal(b.refund.dispatchDeduction, 350);
  assert.equal(b.refund.dispatchReason, 'Fuel and the crew trip');
  assert.equal(b.refund.status, 'Processed');
});

test('a fee above the down payment is refused and the refund stays pending', async () => {
  const b = booking({ date: manilaTodayKey() });
  await cancel();
  const done = await processRefund({ dispatchDeduction: 1200 });
  assert.equal(done.status, 400);
  assert.match(done.body.message, /cannot be more than/);
  assert.equal(b.refund.status, 'Pending');
});

test('a date sent by the client changes nothing: the booked date is compared with the Manila day on the server', async () => {
  const b = booking({ date: goodDate(7) });
  const res = await cancel({ date: goodDate(7), today: goodDate(7), isSameDay: true, cancelledAt: '2000-01-01' });
  assert.equal(res.status, 200);
  assert.equal(b.refund.isSameDay, false, 'a client claiming it is the booked day does not make it so');
  assert.equal(b.refund.refundableAmount, 1000);

  harness.reset({ users: people(), services: [cleaning] });
  const today = booking({ date: manilaTodayKey() });
  await cancel({ isSameDay: false, today: goodDate(30) });
  assert.equal(today.refund.isSameDay, true, 'and a client claiming it is another day does not make it so either');
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

// ---- on or after the booked date: the booked day, the day after, several days after
const daysFromToday = (n) => addDays(manilaTodayKey(), n);

test('the day before the booked date: the whole down payment is refundable, no fee asked', async () => {
  const b = booking({ date: daysFromToday(1) });
  assert.equal((await cancel()).status, 200);
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.refund.refundableAmount, 1000);
});

test('the booked day, the day after and several days after: a transportation fee applies, nothing is refundable until the admin enters it', async () => {
  for (const offset of [0, -1, -3, -10]) {
    harness.reset({ users: people(), services: [cleaning] });
    const b = booking({ date: daysFromToday(offset) });
    assert.equal((await cancel()).status, 200, `offset ${offset}`);
    assert.equal(b.refund.status, 'Pending', `offset ${offset}`);
    assert.equal(b.refund.isSameDay, true, `offset ${offset}: on or after the booked date`);
    assert.equal(b.refund.refundableAmount, undefined, `offset ${offset}: the fee is not known yet`);
    const missing = await processRefund({});
    assert.equal(missing.status, 400, `offset ${offset}`);
    assert.match(missing.body.message, /on or after the booked date/);
  }
});

test('after the booked date: a fee of 0, a normal fee, and a fee above the down payment', async () => {
  const b = booking({ date: daysFromToday(-2) });
  await cancel();
  const tooMuch = await processRefund({ dispatchDeduction: 1001 });
  assert.equal(tooMuch.status, 400);
  assert.match(tooMuch.body.message, /cannot be more than/);
  assert.equal(b.refund.status, 'Pending');
  const normal = await processRefund({ dispatchDeduction: 400, dispatchReason: 'The crew went and found nobody home' });
  assert.equal(normal.status, 200, JSON.stringify(normal.body));
  assert.equal(b.refund.refundableAmount, 600);
  assert.equal(b.refund.dispatchDeduction, 400);
  assert.equal(b.refund.dispatchReason, 'The crew went and found nobody home');
  harness.reset({ users: people(), services: [cleaning] });
  const free = booking({ date: daysFromToday(-5) });
  await cancel();
  assert.equal((await processRefund({ dispatchDeduction: 0 })).status, 200);
  assert.equal(free.refund.refundableAmount, 1000, 'fee 0: the whole down payment goes back');
});

test('a fake date sent by the client does not turn a late cancellation into a full refund', async () => {
  const b = booking({ date: daysFromToday(-3) });
  const res = await cancel({ date: daysFromToday(30), today: daysFromToday(-30), isSameDay: false, cancelledAt: daysFromToday(-30) });
  assert.equal(res.status, 200);
  assert.equal(b.refund.isSameDay, true);
  assert.equal(b.refund.refundableAmount, undefined);
});
