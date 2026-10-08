// Run with: npm test (inside server/). Tests the Statement of Account rules, which have no browser-only imports.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'statementBuilder.js')).href);
const pricingOf = (b) => ({ total: b.total, downPayment: b.down, balance: b.total - b.down });
const mk = (id, over) => ({ bookingId: id, customer: { _id: 'C1' }, service: { name: 'Cleaning' }, date: '2026-09-10', createdAt: '2026-09-01T02:00:00Z', status: 'Completed', total: 1000, down: 300, paymentStatus: 'Unpaid', ...over });
const range = { fromKey: '2026-09-01', toKey: '2026-09-30', dateBasis: 'service' };

test('a fully paid booking owes nothing, a partly paid one owes the balance, an unpaid one owes it all', async () => {
  const { buildStatement } = await load();
  const s = buildStatement('C1', [
    mk('B1', { paymentStatus: 'fully_paid' }),
    mk('B2', { paymentStatus: 'partially_paid' }),
    mk('B3', {}),
  ], range, pricingOf);
  assert.deepEqual(s.lines.map((l) => [l.paid, l.balance, l.status]), [[1000, 0, 'Fully paid'], [300, 700, 'Partly paid'], [0, 1000, 'Unpaid']]);
  assert.deepEqual(s.totals, { total: 3000, paid: 1300, balance: 1700 });
  assert.equal(s.outstanding, 1700);
});

test('a cancelled booking with a processed refund is not billed and shows what is left after the refund', async () => {
  const { buildStatement } = await load();
  const s = buildStatement('C1', [
    mk('B1', { status: 'Cancelled', paymentStatus: 'partially_paid', refund: { status: 'Processed', downPaymentAmount: 300, finalAmount: 200, refundableAmount: 300 } }),
  ], range, pricingOf);
  const line = s.lines[0];
  assert.equal(line.total, 0);
  assert.equal(line.paid, 100); // paid 300, 200 sent back
  assert.equal(line.balance, 0);
  assert.equal(line.status, 'Cancelled, ₱200 refunded');
  assert.deepEqual(s.rows[0].slice(3, 6), ['-', '₱100', '-']);
  assert.equal(s.outstanding, 0);
});

test('a cancelled booking with a pending refund keeps its paid amount and says so', async () => {
  const { buildStatement } = await load();
  const s = buildStatement('C1', [mk('B1', { status: 'Cancelled', refund: { status: 'Pending', downPaymentAmount: 300 } })], range, pricingOf);
  assert.equal(s.lines[0].paid, 300);
  assert.equal(s.lines[0].status, 'Cancelled, refund pending');
});

test('only this customer, only the range, no free back-job visits', async () => {
  const { buildStatement } = await load();
  const s = buildStatement('C1', [
    mk('IN'), mk('OTHER', { customer: { _id: 'C2' } }), mk('LATE', { date: '2026-10-02' }), mk('BJ', { isBackJob: true }),
  ], range, pricingOf);
  assert.deepEqual(s.lines.map((l) => l.booking.bookingId), ['IN']);
});

test('rows are in date order and the totals row matches the shown numbers', async () => {
  const { buildStatement } = await load();
  const s = buildStatement('C1', [mk('B2', { date: '2026-09-20', paymentStatus: 'fully_paid' }), mk('B1', { date: '2026-09-05' })], range, pricingOf);
  assert.deepEqual(s.rows.map((r) => r[1]), ['B1', 'B2']);
  assert.deepEqual(s.totalRow, ['Total', '', '', '₱2,000', '₱1,000', '₱1,000', '']);
});

test('an overpaid booking never shows a negative balance', async () => {
  const { buildStatement } = await load();
  const s = buildStatement('C1', [mk('B1', { paymentStatus: 'partially_paid', total: 500, down: 600 })], range, pricingOf);
  assert.equal(s.lines[0].balance, 0);
});
