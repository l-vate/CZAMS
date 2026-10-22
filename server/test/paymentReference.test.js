// Run with: npm test (inside server/).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readPaymentSubmission, findSameReference, modeNeedsReference } = require('../utils/paymentReference');

const pay = (over) => readPaymentSubmission({ mode: 'GCash', reference: '1234567890123', hasProof: true, strict: true, ...over });

test('GCash with a proof and no reference is a 400', () => {
  const r = pay({ reference: '' });
  assert.equal(r.problem.status, 400);
  assert.match(r.problem.message, /reference number/);
});

test('GCash with a reference and no proof is a 400', () => {
  const r = pay({ hasProof: false });
  assert.equal(r.problem.status, 400);
  assert.match(r.problem.message, /proof of payment/);
});

test('Bank Transfer needs both too, in any letter case', () => {
  assert.equal(pay({ mode: 'bank transfer', reference: undefined }).problem.status, 400);
  assert.equal(pay({ mode: 'Bank Transfer' }).problem, null);
});

test('Cash passes with neither proof nor reference', () => {
  const r = pay({ mode: 'Cash', reference: undefined, hasProof: false });
  assert.equal(r.problem, null);
  assert.equal(r.reference, undefined);
});

test('an unknown or missing mode needs no reference', () => {
  assert.equal(modeNeedsReference('Cheque'), false);
  assert.equal(pay({ mode: undefined, reference: '', hasProof: false }).problem, null);
});

test('bad characters and bad lengths are a 400, even for Cash', () => {
  for (const reference of ['AB 1234', 'AB#1234', 'abc', 'x'.repeat(31)]) {
    assert.equal(pay({ reference }).problem.status, 400, reference);
    assert.equal(pay({ mode: 'Cash', reference }).problem.status, 400, reference);
  }
});

test('a Bank Transfer reference stays flexible: trimmed, upper case, letters, digits and dashes', () => {
  assert.equal(pay({ mode: 'Bank Transfer', reference: '  gc-12ab ' }).reference, 'GC-12AB');
  assert.equal(pay({ mode: 'Bank Transfer', reference: 'AB-1234' }).problem, null);
  assert.equal(pay({ mode: 'Bank Transfer', reference: '12' }).problem.status, 400);
});

test('an admin walk-in may leave the reference out but not send a bad one', () => {
  assert.equal(pay({ strict: false, reference: '', hasProof: false }).problem, null);
  assert.equal(pay({ strict: false, reference: '!!' }).problem.status, 400);
});

test('a GCash reference is exactly 13 digits, with or without spaces, and the stored value has no spaces', () => {
  assert.equal(pay({ reference: '1234567890123' }).problem, null);
  assert.equal(pay({ reference: '1234567890123' }).reference, '1234567890123');
  assert.equal(pay({ reference: '1234 567 890123' }).reference, '1234567890123');
  assert.equal(pay({ reference: ' 1234-5678-9012-3 ' }).reference, '1234567890123');
});

test('a GCash reference with 12 or 14 digits, or with letters, is a 400 with a clear message', () => {
  for (const reference of ['123456789012', '12345678901234', '12345678901A3', 'GC-1234567890', '1234 5678 9012']) {
    const r = pay({ reference });
    assert.equal(r.problem.status, 400, reference);
    assert.equal(r.problem.message, 'A GCash reference number has 13 digits. Check your receipt.', reference);
  }
});

test('the GCash rule is for the customer paying: an admin walk-in keeps the general format', () => {
  assert.equal(pay({ strict: false, reference: 'AB-1234', hasProof: false }).problem, null);
});

test('the number of GCash digits is one constant, read from one file', () => {
  const { GCASH_REFERENCE_DIGITS } = require('../utils/paymentReference');
  assert.equal(GCASH_REFERENCE_DIGITS, require('../constants/paymentReference.json').GCASH_REFERENCE_DIGITS);
  assert.equal(GCASH_REFERENCE_DIGITS, 13);
});

const memoryBookings = (rows) => ({
  find: (q) => ({
    select: () => ({
      lean: async () => rows.filter((o) => o.bookingId !== q.bookingId.$ne
        && q.$or.some((c) => Object.entries(c).some(([k, v]) => v.$in.includes(o[k])))),
    }),
  }),
});

test('duplicate lookup returns the other payments with the same reference and the same method', async () => {
  const rows = [
    { bookingId: 'CZ-1', referenceNumber: 'REF-1', paymentMode: 'GCash' },
    { bookingId: 'CZ-2', referenceNumber: 'REF-1', paymentMode: 'GCash' },
    { bookingId: 'CZ-3', balanceReferenceNumber: 'REF-1', paymentMode2: 'GCash' },
    { bookingId: 'CZ-4', referenceNumber: 'OTHER', paymentMode: 'GCash' },
    { bookingId: 'CZ-5', referenceNumber: 'REF-1', paymentMode: 'Bank Transfer' },
  ];
  const found = await findSameReference(memoryBookings(rows), rows[0]);
  assert.deepEqual(found.map((d) => d.bookingId), ['CZ-2', 'CZ-3']);
  assert.equal(found[0].reference, 'REF-1');
  assert.equal(found[0].method, 'GCash');
  assert.deepEqual(await findSameReference(memoryBookings(rows), { bookingId: 'CZ-9' }), []);
});

test('a duplicate is only a warning: the same reference still passes the submission check', () => {
  assert.equal(pay({ reference: '1234567890123' }).problem, null);
});
