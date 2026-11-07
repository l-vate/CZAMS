// Run with: npm test (inside server/). The GCash reference box takes digits only and stops at the required length; the bank reference
// keeps its flexible rule; the server rule is unchanged.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });
const load = () => vite.ssrLoadModule('/src/utils/paymentReference.js');

test('a GCash box keeps digits only and stops at the required length', async () => {
  const { typedReference, GCASH_REFERENCE_DIGITS } = await load();
  assert.equal(typedReference('12ab34', 'GCash'), '1234');
  assert.equal(typedReference('1234 5678 9012 3456', 'GCash'), '1234567890123');
  assert.equal(typedReference('1'.repeat(40), 'GCash').length, GCASH_REFERENCE_DIGITS);
  assert.equal(typedReference('', 'GCash'), '');
});

test('a bank transfer box keeps what is typed (letters, digits and dashes, 4 to 30)', async () => {
  const { typedReference, referenceError } = await load();
  assert.equal(typedReference('ab-12', 'Bank Transfer'), 'ab-12');
  assert.equal(referenceError('AB-1234', 'Bank Transfer'), '');
  assert.notEqual(referenceError('ab', 'Bank Transfer'), '');
});

test('a reference that is too short says how many digits it needs and how many were typed', async () => {
  const { referenceError } = await load();
  assert.match(referenceError('12345', 'GCash'), /13 digits\. You typed 5/);
});

test('the server rule is unchanged: 13 digits for GCash, flexible for a bank', () => {
  const { readPaymentSubmission } = require('../utils/paymentReference');
  assert.ok(readPaymentSubmission({ mode: 'GCash', reference: '123', hasProof: true, strict: true }).problem);
  assert.equal(readPaymentSubmission({ mode: 'GCash', reference: '1234567890123', hasProof: true, strict: true }).problem, null);
  assert.equal(readPaymentSubmission({ mode: 'Bank Transfer', reference: 'AB-1234', hasProof: true, strict: true }).problem, null);
});

test('the payment form uses a numeric keyboard and the digit limit for GCash', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'payment_modal.jsx'), 'utf8');
  assert.match(src, /maxLength=\{isGcashMode\(selectedModeName\) \? GCASH_REFERENCE_DIGITS : REFERENCE_MAX\}/);
  assert.match(src, /inputMode=\{isGcashMode\(selectedModeName\) \? 'numeric' : 'text'\}/);
  assert.match(src, /typedReference\(e\.target\.value, selectedModeName\)/);
});
