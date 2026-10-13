// Run with: npm test (inside server/).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readPaymentSubmission, findSameReference, modeNeedsReference } = require('../utils/paymentReference');

const pay = (over) => readPaymentSubmission({ mode: 'GCash', reference: 'AB-1234', hasProof: true, strict: true, ...over });

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

test('the stored reference is trimmed and upper case', () => {
  assert.equal(pay({ reference: '  gc-12ab ' }).reference, 'GC-12AB');
});

test('an admin walk-in may leave the reference out but not send a bad one', () => {
  assert.equal(pay({ strict: false, reference: '', hasProof: false }).problem, null);
  assert.equal(pay({ strict: false, reference: '!!' }).problem.status, 400);
});

test('duplicate lookup returns the other bookings with the same reference', async () => {
  const rows = [
    { bookingId: 'CZ-1', referenceNumber: 'REF-1' },
    { bookingId: 'CZ-2', referenceNumber: 'REF-1' },
    { bookingId: 'CZ-3', balanceReferenceNumber: 'REF-1' },
    { bookingId: 'CZ-4', referenceNumber: 'OTHER' },
  ];
  const Booking = {
    find: (q) => ({
      select: () => ({
        lean: async () => rows.filter((o) => o.bookingId !== q.bookingId.$ne
          && q.$or.some((c) => Object.entries(c).some(([k, v]) => v.$in.includes(o[k])))),
      }),
    }),
  };
  const found = await findSameReference(Booking, rows[0]);
  assert.deepEqual(found.map((d) => d.bookingId), ['CZ-2', 'CZ-3']);
  assert.equal(found[0].reference, 'REF-1');
  assert.deepEqual(await findSameReference(Booking, { bookingId: 'CZ-9' }), []);
});
