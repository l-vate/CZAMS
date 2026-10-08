// Run with: npm test (inside server/). Tests the sales / payments / rating rules, which have no browser-only imports.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'salesFigures.js')).href);

// A tiny price model for the tests: total and down payment are stored on the fake booking.
const pricingOf = (b) => ({ total: b.total, downPayment: b.down, balance: b.total - b.down });
const b = (over) => ({ status: 'Completed', date: '2026-09-10', createdAt: '2026-09-01T02:00:00.000Z', total: 1000, down: 300, paymentStatus: 'Unpaid', customer: { clientType: 'Residential' }, ...over });
const range = { fromKey: '2026-09-01', toKey: '2026-09-30', dateBasis: 'service' };

test('sales add up the final total of Completed bookings in the range only', async () => {
  const { salesFigures } = await load();
  const r = salesFigures([
    b({ total: 1000 }), b({ total: 2500 }),
    b({ status: 'Pending', total: 9999 }), b({ status: 'Cancelled', total: 9999 }),
    b({ date: '2026-10-01', total: 7777 }), b({ isBackJob: true, total: 5555 }),
  ], range, pricingOf);
  assert.equal(r.sales, 3500);
  assert.equal(r.completedCount, 2);
});

test('payments collected counts verified payments only and nets out processed refunds', async () => {
  const { salesFigures } = await load();
  const r = salesFigures([
    b({ paymentStatus: 'partially_paid' }),                                   // down payment 300
    b({ paymentStatus: 'fully_paid' }),                                        // 1000
    b({ paymentStatus: 'to_verify' }),                                         // not verified: 0
    b({ paymentStatus: 'Unpaid' }),                                            // 0
    b({ status: 'Cancelled', paymentStatus: 'partially_paid', refund: { status: 'Processed', finalAmount: 200, refundableAmount: 300 } }), // 300 paid, 200 back
    b({ status: 'Cancelled', paymentStatus: 'partially_paid', refund: { status: 'Pending' } }), // 300 paid, nothing back yet
  ], range, pricingOf);
  assert.equal(r.paidGross, 300 + 1000 + 300 + 300);
  assert.equal(r.refunded, 200);
  assert.equal(r.collected, 1900 - 200);
});

test('a balance paid on its own track counts the whole total', async () => {
  const { amountPaid } = await load();
  assert.equal(amountPaid(b({ paymentStatus: 'partially_paid', balancePaid: true }), pricingOf), 1000);
  assert.equal(amountPaid(b({ paymentStatus: 'partially_paid', balancePaymentStatus: 'to_verify' }), pricingOf), 300);
});

test('the date basis picks service date or date requested', async () => {
  const { salesFigures } = await load();
  const rows = [b({ date: '2026-10-05', createdAt: '2026-09-20T02:00:00.000Z', total: 400 })];
  assert.equal(salesFigures(rows, { ...range, dateBasis: 'service' }, pricingOf).sales, 0);
  assert.equal(salesFigures(rows, { ...range, dateBasis: 'requested' }, pricingOf).sales, 400);
});

test('sales per month fills empty months with zero and matches the total', async () => {
  const { salesFigures } = await load();
  const r = salesFigures([b({ date: '2026-07-10', total: 100 }), b({ date: '2026-09-10', total: 300 })], { fromKey: '2026-07-01', toKey: '2026-09-30', dateBasis: 'service' }, pricingOf);
  assert.deepEqual(r.perMonth.map((m) => [m.key, m.value]), [['2026-07', 100], ['2026-08', 0], ['2026-09', 300]]);
  assert.equal(r.perMonth.reduce((s, m) => s + m.value, 0), r.sales);
});

test('an open range uses every booking and months from the data', async () => {
  const { salesFigures } = await load();
  const r = salesFigures([b({ date: '2026-07-10', total: 100 }), b({ date: '2026-09-10', total: 300 })], { fromKey: '', toKey: '', dateBasis: 'service' }, pricingOf);
  assert.equal(r.sales, 400);
  assert.equal(r.perMonth.length, 3);
});

test('client type filter', async () => {
  const { matchesClientType } = await load();
  assert.equal(matchesClientType(b({ customer: { clientType: 'Commercial' } }), 'Residential'), false);
  assert.equal(matchesClientType(b({ customer: {} }), 'Residential'), true);
  assert.equal(matchesClientType(b({}), 'all'), true);
});

test('average rating per technician counts for lead and helper alike', async () => {
  const { technicianRatings } = await load();
  const members = () => [{ _id: 'A', name: 'Anna' }, { _id: 'B', name: 'Ben' }];
  const rows = technicianRatings([b({ feedback: { rating: 5 } }), b({ feedback: { rating: 4 } }), b({})], members);
  assert.deepEqual([rows.get('A').ratings, rows.get('A').total], [2, 9]);
  assert.deepEqual([rows.get('B').ratings, rows.get('B').total], [2, 9]);
});

test('top rated needs at least 3 ratings and breaks ties by count then name', async () => {
  const { topRatedTechnician } = await load();
  const rows = new Map([
    ['A', { id: 'A', name: 'Anna', total: 10, ratings: 2 }],
    ['B', { id: 'B', name: 'Ben', total: 13, ratings: 3 }],
    ['C', { id: 'C', name: 'Cara', total: 17, ratings: 4 }],
  ]);
  assert.equal(topRatedTechnician(rows).name, 'Ben'); // Anna has the best average but only 2 ratings
  assert.equal(topRatedTechnician(new Map([['A', rows.get('A')]])), null);
  const tie = new Map([['B', { id: 'B', name: 'Ben', total: 12, ratings: 3 }], ['C', { id: 'C', name: 'Cara', total: 16, ratings: 4 }]]);
  assert.equal(topRatedTechnician(tie).name, 'Cara');
});
