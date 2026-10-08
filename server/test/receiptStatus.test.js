// Run with: npm test (inside server/). Tests the invoice / receipt rule, which has no browser-only imports.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'receiptStatus.js')).href);

test('the title is Invoice while unpaid and Acknowledgment Receipt once fully paid', async () => {
  const { documentTitle } = await load();
  assert.equal(documentTitle(false), 'Invoice');
  assert.equal(documentTitle(true), 'Acknowledgment Receipt');
});

test('unpaid, to verify and down payment only are not fully paid', async () => {
  const { isBookingFullyPaid } = await load();
  assert.equal(isBookingFullyPaid({ paymentStatus: 'Unpaid' }), false);
  assert.equal(isBookingFullyPaid({ paymentStatus: 'to_verify' }), false);
  assert.equal(isBookingFullyPaid({ paymentStatus: 'partially_paid', balancePaymentStatus: 'None' }), false);
  assert.equal(isBookingFullyPaid({ paymentStatus: 'partially_paid', balancePaymentStatus: 'to_verify' }), false);
});

test('fully paid by status, by the legacy Paid status, or by a settled balance', async () => {
  const { isBookingFullyPaid } = await load();
  assert.equal(isBookingFullyPaid({ paymentStatus: 'fully_paid' }), true);
  assert.equal(isBookingFullyPaid({ paymentStatus: 'Paid' }), true);
  assert.equal(isBookingFullyPaid({ paymentStatus: 'partially_paid', balancePaymentStatus: 'paid' }), true);
  assert.equal(isBookingFullyPaid({ paymentStatus: 'partially_paid', balancePaid: true }), true);
});
