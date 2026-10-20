// Run with: npm test (inside server/).
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRefundAmounts } = require('../utils/refundAmounts');

const refund = (over) => resolveRefundAmounts({ amountPaid: 1200, isSameDay: false, ...over });

test('no change: the computed amount is refunded and nothing is recorded as adjusted', () => {
  const r = refund({});
  assert.equal(r.problem, null);
  assert.deepEqual(r.values, { computedAmount: 1200, finalAmount: 1200, adjustmentReason: undefined, dispatchReason: undefined, adjusted: false });
});

test('a lower final amount with a reason is accepted and recorded', () => {
  const r = refund({ finalAmount: '1000', reason: '  Technician already bought parts ' });
  assert.equal(r.problem, null);
  assert.equal(r.values.computedAmount, 1200);
  assert.equal(r.values.finalAmount, 1000);
  assert.equal(r.values.adjustmentReason, 'Technician already bought parts');
  assert.equal(r.values.adjusted, true);
});

test('a lower final amount without a reason is a 400', () => {
  for (const reason of [undefined, '', '  ', 'ab', 'x'.repeat(301)]) {
    const r = refund({ finalAmount: 1000, reason });
    assert.equal(r.problem.status, 400, String(reason));
    assert.match(r.problem.message, /reason of 3 to 300 characters/);
  }
  assert.equal(refund({ finalAmount: 1000, reason: 'x'.repeat(300) }).problem, null);
});

test('a final amount above what the customer paid is a 400', () => {
  const r = refund({ finalAmount: 1300, reason: 'Goodwill' });
  assert.equal(r.problem.status, 400);
  assert.match(r.problem.message, /more than the ₱1,200 the customer paid/);
});

test('a final amount equal to the amount paid needs no reason', () => {
  assert.equal(refund({ finalAmount: 1200 }).problem, null);
});

test('a negative or non-numeric final amount is a 400', () => {
  assert.equal(refund({ finalAmount: -5, reason: 'abc' }).problem.status, 400);
  assert.equal(refund({ finalAmount: 'lots', reason: 'abc' }).problem.status, 400);
});

test('same-day: a 200 deduction feeds the same fields with no admin reason needed', () => {
  const r = refund({ isSameDay: true, dispatchDeduction: '200' });
  assert.equal(r.problem, null);
  assert.equal(r.values.computedAmount, 1200);
  assert.equal(r.values.finalAmount, 1000);
  assert.equal(r.values.adjustmentReason, 'Transportation fee of ₱200 for cancelling on the booked date');
  assert.equal(r.values.adjusted, true);
});

test('same-day without a valid deduction is a 400; a zero deduction is fine', () => {
  assert.equal(refund({ isSameDay: true }).problem.status, 400);
  assert.equal(refund({ isSameDay: true, dispatchDeduction: -1 }).problem.status, 400);
  const r = refund({ isSameDay: true, dispatchDeduction: 0 });
  assert.equal(r.problem, null);
  assert.equal(r.values.adjusted, false);
});

test('same-day with an extra admin change needs a reason and keeps both texts', () => {
  assert.equal(refund({ isSameDay: true, dispatchDeduction: 200, finalAmount: 900 }).problem.status, 400);
  const r = refund({ isSameDay: true, dispatchDeduction: 200, finalAmount: 900, reason: 'Parts used' });
  assert.equal(r.values.finalAmount, 900);
  assert.equal(r.values.adjustmentReason, 'Transportation fee of ₱200 for cancelling on the booked date. Parts used');
});
