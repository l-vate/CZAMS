// Run with: npm test (inside server/). E34: a customer can cancel a Pending or Approved booking only, and always gets the whole down payment back. Once the
// booking is In Progress (started by the system or by the crew) the customer cannot cancel. A part of the down payment is kept only when an admin cancels
// because the customer was not available at the address or the technicians were already on the way, and the admin types the amount (0 up to the down
// payment). An owner cancel with no deduction is a full refund. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const harness = require('./helpers/createBooking');
const { REAL_PNG } = require('./helpers/images');
const { manilaTodayKey } = require('../utils/timeBlocks');

const { state, call, addBooking, goodDate, base } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const people = () => [
  { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer' },
  { _id: 'CUS2', role: 'customer', isActive: true, name: 'Other Customer' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
];
// a 2000 peso job with a 50 percent down payment: 1000 paid
const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }], date: goodDate(7), time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000, balancePaymentStatus: 'None', refund: { status: 'None' }, ...over,
});
const customerCancel = (as = 'CUS1') => call('PATCH', '/CZ-1/cancel', as, {});
const adminCancel = (body) => call('PATCH', '/CZ-1/admin-update', 'ADM1', { status: 'Cancelled', ...body }, { role: 'admin' });
const UNAVAILABLE = { cancelKind: 'customer_unavailable' };
const ON_THE_WAY = { cancelKind: 'technicians_on_the_way' };
const customerNotes = () => state.notes.filter((n) => n.user === 'CUS1' || n.userId === 'CUS1' || n.recipient === 'CUS1');

async function processRefund(fields = {}) {
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

// ---- the customer's own cancel

test('a customer cancels a Pending booking: the whole down payment, no fee', async () => {
  const b = booking({ status: 'Pending' });
  const res = await customerCancel();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.cancelledBy, 'customer');
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.refund.dispatchDeduction, 0);
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.refund.deductionDecided, undefined);
});

test('a customer cancels an Approved booking: the whole down payment, on any date, even the booked day', async () => {
  for (const date of [goodDate(7), goodDate(1), manilaTodayKey()]) {
    harness.reset({ users: people(), services: [cleaning] });
    const b = booking({ date });
    const res = await customerCancel();
    assert.equal(res.status, 200, `${date}: ${JSON.stringify(res.body)}`);
    assert.equal(b.refund.refundableAmount, 1000, date);
    assert.equal(b.refund.isSameDay, false, date);
    assert.equal(b.refund.dispatchDeduction, 0, date);
  }
});

test('a customer cannot make a cancellation keep a fee: nothing they send changes the refund', async () => {
  const b = booking();
  const res = await call('PATCH', '/CZ-1/cancel', 'CUS1', { cancelKind: 'customer_unavailable', cancelDeduction: 900, deductionAmount: 900, dispatchDeduction: 900, isSameDay: true });
  assert.equal(res.status, 200);
  assert.equal(b.cancelKind, undefined);
  assert.equal(b.refund.refundableAmount, 1000);
});

test('a customer cannot cancel an In Progress booking: a clear message, and nothing changes', async () => {
  const b = booking({ status: 'In Progress' });
  const res = await customerCancel();
  assert.equal(res.status, 400);
  assert.match(res.body.message, /already in progress and can no longer be cancelled online/);
  assert.equal(b.status, 'In Progress');
  assert.equal(b.refund.status, 'None');
  assert.equal(state.notes.length, 0, 'nobody is told about a cancellation that did not happen');
});

test('a booking the day start job started by itself cannot be cancelled by the customer either', async () => {
  const b = booking({ status: 'In Progress', startedBySystem: true, date: manilaTodayKey() });
  const res = await customerCancel();
  assert.equal(res.status, 400);
  assert.match(res.body.message, /already in progress/);
  assert.equal(b.status, 'In Progress');
});

test('a booking with a no show report waiting, a Completed one and a Cancelled one cannot be cancelled by the customer', async () => {
  const waiting = booking({ noShow: { status: 'Reported' } });
  const reported = await customerCancel();
  assert.equal(reported.status, 400);
  assert.match(reported.body.message, /no show report/);
  assert.equal(waiting.status, 'Approved');
  for (const status of ['Completed', 'Cancelled']) {
    harness.reset({ users: people(), services: [cleaning] });
    booking({ status });
    assert.equal((await customerCancel()).status, 400, status);
  }
});

test("a customer cannot cancel another customer's booking", async () => {
  const b = booking();
  assert.equal((await customerCancel('CUS2')).status, 404);
  assert.equal(b.status, 'Approved');
});

test('an admin cannot use the customer route', async () => {
  const b = booking();
  const res = await call('PATCH', '/CZ-1/cancel', 'ADM1', {}, { role: 'admin' });
  assert.ok([401, 403, 404].includes(res.status), String(res.status));
  assert.equal(b.status, 'Approved');
});

// ---- the admin cancel that keeps a part of the down payment

for (const [label, kind] of [['the customer was not available at the address', UNAVAILABLE], ['the technicians were already on the way', ON_THE_WAY]]) {
  test(`an admin cancels an In Progress booking because ${label}: the amount the admin types is kept, the rest is refunded`, async () => {
    const b = booking({ status: 'In Progress' });
    const res = await adminCancel({ ...kind, deductionAmount: 350 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(b.status, 'Cancelled');
    assert.equal(b.cancelledBy, 'admin');
    assert.equal(b.cancelKind, kind.cancelKind);
    assert.equal(b.cancelDeduction, 350);
    assert.equal(b.refund.status, 'Pending');
    assert.equal(b.refund.deductionDecided, true);
    assert.equal(b.refund.isSameDay, false);
    assert.equal(b.refund.downPaymentAmount, 1000);
    assert.equal(b.refund.dispatchDeduction, 350);
    assert.equal(b.refund.refundableAmount, 650);
    assert.match(b.refund.dispatchReason, kind === UNAVAILABLE ? /Customer not available at the address/ : /Technicians already on the way/);
  });
}

test('the same cancel works on an Approved booking, and a deduction of 0 is a full refund', async () => {
  const b = booking({ status: 'Approved' });
  const res = await adminCancel({ ...ON_THE_WAY, deductionAmount: 0 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.refund.dispatchDeduction, 0);
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.refund.deductionDecided, true);
});

test('the whole down payment can be kept (the refund is 0, never negative), and centavos are kept', async () => {
  const b = booking({ status: 'In Progress' });
  assert.equal((await adminCancel({ ...UNAVAILABLE, deductionAmount: 1000 })).status, 200);
  assert.equal(b.refund.refundableAmount, 0);
  harness.reset({ users: people(), services: [cleaning] });
  const c = booking({ status: 'In Progress' });
  assert.equal((await adminCancel({ ...UNAVAILABLE, deductionAmount: '250.55' })).status, 200);
  assert.equal(c.refund.dispatchDeduction, 250.55);
  assert.equal(c.refund.refundableAmount, 749.45);
});

test('a deduction above the down payment is refused and nothing is cancelled', async () => {
  const b = booking({ status: 'In Progress' });
  const res = await adminCancel({ ...UNAVAILABLE, deductionAmount: 1000.01 });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /cannot be more than the ₱1,000\.00 down payment/);
  assert.equal(b.status, 'In Progress');
  assert.equal(b.refund.status, 'None');
  assert.equal(b.cancelKind, undefined);
});

test('a negative, missing or non numeric deduction is refused', async () => {
  const b = booking({ status: 'In Progress' });
  const negative = await adminCancel({ ...ON_THE_WAY, deductionAmount: -1 });
  assert.equal(negative.status, 400);
  assert.match(negative.body.message, /cannot be negative/);
  for (const deductionAmount of [undefined, '', '  ', 'abc', null, {}, [5]]) {
    const res = await adminCancel({ ...ON_THE_WAY, deductionAmount });
    assert.equal(res.status, 400, JSON.stringify(deductionAmount));
  }
  assert.equal(b.status, 'In Progress');
});

test('an unknown reason is refused, and a deduction without one of the two reasons is refused', async () => {
  const b = booking({ status: 'Approved' });
  assert.equal((await adminCancel({ cancelKind: 'because', deductionAmount: 10 })).status, 400);
  const withoutReason = await adminCancel({ deductionAmount: 200 });
  assert.equal(withoutReason.status, 400);
  assert.match(withoutReason.body.message, /needs a reason/);
  const withOther = await adminCancel({ cancelReason: 'The customer moved away', deductionAmount: 200 });
  assert.equal(withOther.status, 400);
  assert.equal(b.status, 'Approved');
});

test('a deduction of 0 sent without a reason is just a normal cancel', async () => {
  const b = booking({ status: 'Approved' });
  assert.equal((await adminCancel({ cancelReason: 'Customer request', deductionAmount: 0 })).status, 200);
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.refund.deductionDecided, undefined);
});

test('a Pending booking is refunded in full: no deduction can be kept from it', async () => {
  const b = booking({ status: 'Pending' });
  const res = await adminCancel({ ...UNAVAILABLE, deductionAmount: 100 });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Approved or In Progress/);
  assert.equal(b.status, 'Pending');
});

test('the owner cannot supply or serve takes no deduction, and stays a full refund, also on an In Progress booking', async () => {
  const both = booking({ status: 'In Progress' });
  const refused = await adminCancel({ ...UNAVAILABLE, ownerInitiated: true, cancelReason: 'We do not carry that brand', deductionAmount: 100 });
  assert.equal(refused.status, 400);
  assert.equal(both.status, 'In Progress');
  const ok = await adminCancel({ ownerInitiated: true, cancelReason: 'We do not carry that brand' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(both.status, 'Cancelled');
  assert.equal(both.ownerCancelled, true);
  assert.equal(both.refund.ownerInitiated, true);
  assert.equal(both.refund.dispatchDeduction, 0);
  assert.equal(both.refund.refundableAmount, 1000);
});

test('an owner cancel with no deduction on an Approved booking is a full refund', async () => {
  const b = booking({ status: 'Approved', date: manilaTodayKey() });
  assert.equal((await adminCancel({ ownerInitiated: true, cancelReason: 'We cannot serve that area' })).status, 200);
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.refund.deductionDecided, undefined);
});

test('an In Progress booking cannot be cancelled by the office as a customer request or for another reason: only the three allowed ones', async () => {
  const b = booking({ status: 'In Progress' });
  for (const body of [{}, { cancelReason: 'Customer request' }, { cancelReason: 'The customer moved away' }]) {
    const res = await adminCancel(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.message, /In Progress can only be cancelled because/);
  }
  assert.equal(b.status, 'In Progress');
  assert.equal(b.refund.status, 'None');
});

test('a booking whose down payment was never sent cannot have anything kept, and 0 is fine', async () => {
  const b = booking({ status: 'In Progress', paymentStatus: 'Unpaid', downPaymentPaidAmount: undefined });
  const kept = await adminCancel({ ...UNAVAILABLE, deductionAmount: 50 });
  assert.equal(kept.status, 400);
  assert.match(kept.body.message, /cannot be more than the ₱0\.00 down payment/);
  assert.equal((await adminCancel({ ...UNAVAILABLE, deductionAmount: 0 })).status, 200);
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.refund.status, 'None', 'nothing was paid, so there is nothing to refund');
});

test('a down payment still waiting to be checked: the refund request is opened with the deduction, not paid out until verified', async () => {
  const b = booking({ status: 'In Progress', paymentStatus: 'to_verify', downPaymentPaidAmount: 1000, proofFile: '/uploads/proofs/a.png' });
  assert.equal((await adminCancel({ ...ON_THE_WAY, deductionAmount: 400 })).status, 200);
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.paymentUnverified, true);
  assert.equal(b.refund.dispatchDeduction, 400);
  assert.equal(b.refund.refundableAmount, 600);
  const early = await processRefund();
  assert.equal(early.status, 400, 'not paid out before the proof is verified');
});

// ---- processing the refund keeps the deduction

test('processing the refund starts from the deduction decided at cancel time and asks for no fee', async () => {
  const b = booking({ status: 'In Progress' });
  await adminCancel({ ...UNAVAILABLE, deductionAmount: 350 });
  const done = await processRefund();
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(b.refund.status, 'Processed');
  assert.equal(b.refund.refundableAmount, 650);
  assert.equal(b.refund.finalAmount, 650);
  assert.equal(b.refund.computedAmount, 650);
  assert.equal(b.refund.dispatchDeduction, 350);
  assert.equal(b.refund.adjustmentReason, undefined, 'nobody adjusted it');
});

test('the admin can still adjust that refund, with a reason, but never above what was paid', async () => {
  const b = booking({ status: 'In Progress' });
  await adminCancel({ ...ON_THE_WAY, deductionAmount: 350 });
  const noReason = await processRefund({ finalAmount: 800 });
  assert.equal(noReason.status, 400);
  const tooMuch = await processRefund({ finalAmount: 1200, adjustmentReason: 'Goodwill' });
  assert.equal(tooMuch.status, 400);
  const ok = await processRefund({ finalAmount: 800, adjustmentReason: 'Goodwill after a call' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(b.refund.refundableAmount, 800);
  assert.equal(b.refund.computedAmount, 650);
});

// ---- who is told, and the audit log

test('a customer cancel tells the customer the refund is full, the admins about the refund request, and the technicians', async () => {
  booking({ assignments: [{ lead: 'T1' }] });
  state.users.push({ _id: 'T1', role: 'staff', isActive: true, name: 'Tech' });
  assert.equal((await customerCancel()).status, 200);
  const toCustomer = customerNotes().map((n) => n.message).join(' | ');
  assert.match(toCustomer, /You cancelled booking CZ-1/);
  assert.match(toCustomer, /full down payment of ₱1,000\.00/);
  const toAdmin = state.notes.filter((n) => /refund request is waiting for review/.test(n.message || ''));
  assert.ok(toAdmin.length >= 1, 'the admins hear about the refund request');
  assert.doesNotMatch(toAdmin.map((n) => n.message).join(' '), /transportation fee needed/);
});

test('an admin cancel with a deduction tells the customer the reason, the amount kept and the refund', async () => {
  booking({ status: 'In Progress' });
  assert.equal((await adminCancel({ ...UNAVAILABLE, deductionAmount: 350 })).status, 200);
  const toCustomer = customerNotes().map((n) => n.message).join(' | ');
  assert.match(toCustomer, /cancelled by our team: Customer not available at the address/);
  assert.match(toCustomer, /₱350\.00 was deducted from your down payment of ₱1,000\.00, so your refund is ₱650\.00/);
});

test('an admin cancel with a deduction of 0 tells the customer nothing was deducted', async () => {
  booking({ status: 'Approved' });
  assert.equal((await adminCancel({ ...ON_THE_WAY, deductionAmount: 0 })).status, 200);
  assert.match(customerNotes().map((n) => n.message).join(' | '), /Nothing was deducted: your whole down payment will be refunded/);
});

test('the customer sees the deduction and its reason on the cancelled booking, never the admin figures', async () => {
  booking({ status: 'In Progress' });
  await adminCancel({ ...ON_THE_WAY, deductionAmount: 350 });
  const own = await call('GET', '/CZ-1', 'CUS1');
  assert.equal(own.status, 200);
  assert.equal(own.body.cancelKind, 'technicians_on_the_way');
  assert.equal(own.body.refund.deductionDecided, true);
  assert.equal(own.body.refund.dispatchDeduction, 350);
  assert.equal(own.body.refund.refundableAmount, 650);
});

test('the audit log records the reason and the amount for a cancel with a deduction, and the owner and plain cancels as before', async () => {
  booking({ status: 'In Progress' });
  await adminCancel({ ...UNAVAILABLE, deductionAmount: 350 });
  const entry = state.audits.find((a) => a.action === 'booking.cancel');
  assert.equal(entry.actor.id, 'ADM1');
  assert.equal(entry.meta.kind, 'customer_unavailable');
  assert.equal(entry.meta.deduction, 350);
  harness.reset({ users: people(), services: [cleaning] });
  booking();
  await customerCancel();
  const own = state.audits.find((a) => a.action === 'booking.cancel');
  assert.equal(own.meta.by, 'customer');
});

// ---- the shape of what is stored

test('the constants file and the model agree on the two reasons', () => {
  const kinds = require('../constants/cancelKinds');
  const Booking = require('../models/Booking');
  assert.deepEqual([...kinds.CANCEL_KIND_VALUES].sort(), ['customer_unavailable', 'technicians_on_the_way']);
  assert.deepEqual([...Booking.schema.path('cancelKind').enumValues].sort(), [...kinds.CANCEL_KIND_VALUES].sort());
});
