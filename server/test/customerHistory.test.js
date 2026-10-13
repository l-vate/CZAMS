// Run with: npm test (inside server/).
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeHistory, amountPaid, RECENT_LIMIT } = require('../utils/customerHistory');

const service = { name: 'Cleaning', price: 800 };
let n = 0;
const make = (over) => ({ bookingId: `CZ-${++n}`, service, units: [{ type: 'Split', quantity: 1 }], date: '2026-09-01', createdAt: '2026-08-01T00:00:00Z', status: 'Completed', downPaymentPercent: 50, paymentStatus: 'Unpaid', ...over });

test('counts match an independent count of the same bookings', () => {
  const list = [
    make({ status: 'Completed' }), make({ status: 'Completed' }), make({ status: 'Cancelled' }),
    make({ status: 'Pending' }), make({ status: 'Approved' }), make({ status: 'In Progress' }),
  ];
  const h = summarizeHistory(list, 2);
  assert.deepEqual(h.counts, { total: 6, completed: 2, cancelled: 1, pending: 1, approved: 1, inProgress: 1, backJobs: 2 });
});

test('only the 10 most recent bookings are listed, newest service date first', () => {
  const list = Array.from({ length: 13 }, (_, i) => make({ date: `2026-09-${String(i + 1).padStart(2, '0')}` }));
  const h = summarizeHistory(list, 0);
  assert.equal(h.recent.length, RECENT_LIMIT);
  assert.equal(h.recent[0].date, '2026-09-13');
  assert.equal(h.recent[9].date, '2026-09-04');
  assert.deepEqual(Object.keys(h.recent[0]), ['bookingId', 'service', 'date', 'status', 'total']);
  assert.equal(h.recent[0].total, 800);
});

test('total paid counts verified payments only and total refunded the processed refunds', () => {
  const list = [
    make({ paymentStatus: 'partially_paid' }),                                    // 400 down payment
    make({ paymentStatus: 'fully_paid' }),                                         // 800
    make({ paymentStatus: 'to_verify' }),                                          // 0
    make({ paymentStatus: 'Unpaid' }),                                             // 0
    make({ status: 'Cancelled', paymentStatus: 'partially_paid', refund: { status: 'Processed', finalAmount: 300, refundableAmount: 400 } }),
  ];
  const h = summarizeHistory(list, 0);
  assert.equal(h.totalPaid, 400 + 800 + 400);
  assert.equal(h.totalRefunded, 300);
  assert.equal(amountPaid(make({ paymentStatus: 'partially_paid', balancePaid: true })), 800);
});

test('feedback lists the rating and comment the customer gave', () => {
  const list = [
    make({ feedback: { rating: 5, text: 'Great', createdAt: '2026-09-02' } }),
    make({ feedback: { rating: 3 } }),
    make({}),
  ];
  const h = summarizeHistory(list, 0);
  assert.equal(h.feedback.length, 2);
  assert.deepEqual(h.feedback.map((f) => [f.rating, f.text]).sort(), [[3, ''], [5, 'Great']]);
});

test('a customer with no bookings gets an empty, valid summary', () => {
  const h = summarizeHistory([], 0);
  assert.deepEqual(h.recent, []);
  assert.equal(h.totalPaid, 0);
  assert.equal(h.counts.total, 0);
});
