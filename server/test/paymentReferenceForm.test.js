// Run with: npm test (inside server/). The payment form's reference number rules (src/utils/paymentReference.js): the same GCash rule as
// the server, live messages, the stored value without spaces, and the one shared constant. No database; the client file is loaded through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const load = () => vite.ssrLoadModule('/src/utils/paymentReference.js');

test('the form reads the same GCash digit count as the server, from the one shared file', async () => {
  const form = await load();
  assert.equal(form.GCASH_REFERENCE_DIGITS, require('../constants/paymentReference.json').GCASH_REFERENCE_DIGITS);
  assert.equal(form.GCASH_REFERENCE_DIGITS, require('../utils/paymentReference').GCASH_REFERENCE_DIGITS);
});

test('13 digits are accepted with or without spaces, and are sent without them', async () => {
  const { referenceError, normalizeReference } = await load();
  for (const typed of ['1234567890123', '1234 567 890123', ' 1234-5678-9012-3 ']) {
    assert.equal(referenceError(typed, 'GCash'), '', typed);
    assert.equal(normalizeReference(typed, 'GCash'), '1234567890123', typed);
  }
});

test('12 digits, 14 digits and letters get a clear message that says how many digits were typed', async () => {
  const { referenceError } = await load();
  assert.match(referenceError('123456789012', 'GCash'), /13 digits.*You typed 12/);
  assert.match(referenceError('12345678901234', 'GCash'), /13 digits.*You typed 14/);
  assert.match(referenceError('12345678901A3', 'GCash'), /13 digits.*numbers only/);
  assert.match(referenceError('', 'GCash'), /Enter the reference number/);
});

test('a Bank Transfer reference keeps the flexible rule and is not held to 13 digits', async () => {
  const { referenceError, normalizeReference, referenceHint } = await load();
  assert.equal(referenceError('bpi-12ab', 'Bank Transfer'), '');
  assert.equal(normalizeReference('bpi-12ab', 'Bank Transfer'), 'BPI-12AB');
  assert.match(referenceError('12', 'Bank Transfer'), /4 to 30/);
  assert.equal(referenceHint('GCash'), 'The 13 digit reference number on your GCash receipt.', 'the exact helper text, with no sentence about spaces');
  assert.doesNotMatch(referenceHint('GCash'), /paste|spaces/i);
  assert.match(referenceHint('Bank Transfer'), /4 to 30/);
});
