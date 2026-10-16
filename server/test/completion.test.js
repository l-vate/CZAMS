// Run with: npm test (inside server/). Pure logic only, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { effectiveCompletedAt } = require('../utils/completion');
const { getWarrantyStatus } = require('../utils/warranty');

test('completion date falls back: completedAt, then report time, then updatedAt', () => {
  const completedAt = new Date('2026-01-05');
  const reportAt = new Date('2026-01-06');
  const updatedAt = new Date('2026-01-07');
  assert.equal(effectiveCompletedAt({ completedAt, $locals: { reportCreatedAt: reportAt }, updatedAt }), completedAt);
  assert.equal(effectiveCompletedAt({ $locals: { reportCreatedAt: reportAt }, updatedAt }), reportAt);
  assert.equal(effectiveCompletedAt({ reportCreatedAt: reportAt, updatedAt }), reportAt); // lean objects
  assert.equal(effectiveCompletedAt({ updatedAt }), updatedAt);
  assert.equal(effectiveCompletedAt({}), null);
});

test('a Completed cleaning with no completedAt is covered from the fallback date', () => {
  const updatedAt = new Date(Date.now() - 2 * 86400000);
  const status = getWarrantyStatus({ status: 'Completed', updatedAt, service: { serviceType: 'Cleaning' } });
  assert.equal(status.applicable, true);
  assert.equal(status.workmanship.active, true);
  // 7 Manila calendar days after the completion day, ending at the end of that day (see utils/warranty.js)
  const day = new Date(updatedAt.getTime() + 8 * 3600000);
  const expected = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 7, 23, 59, 59, 999) - 8 * 3600000);
  assert.equal(status.workmanship.expiresAt.getTime(), expected.getTime());
  // not completed: still nothing is covered
  assert.equal(getWarrantyStatus({ status: 'Approved', updatedAt, service: { serviceType: 'Cleaning' } }).applicable, false);
});
