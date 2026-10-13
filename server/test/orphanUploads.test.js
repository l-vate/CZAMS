// Run with: npm test (inside server/). The orphan finder names the proof files nothing refers to, and only names them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findOrphans, referencedNames } = require('../utils/orphanUploads');

const P = (n) => `/uploads/proofs/${n}`;

test('a file referenced by any of the five booking fields or the report photo is not an orphan', () => {
  const bookings = [{ proofFile: P('a.png'), balanceProofFile: P('b.png'), discount: { idFile: P('c.png') }, refund: { proofFile: P('d.png') }, unitPurchaseProof: P('e.png') }];
  const reports = [{ signedFormPhoto: P('f.png') }];
  const filesOnDisk = ['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png', 'lost1.png', 'lost0.pdf'];
  assert.deepEqual(findOrphans({ filesOnDisk, bookings, reports }), ['lost0.pdf', 'lost1.png']);
});

test('missing fields, empty values and other folders are ignored', () => {
  const names = referencedNames([{}, { discount: null }, { proofFile: '' }, { proofFile: '/uploads/profile-images/x.png' }, { proofFile: 7 }], ['proofFile', 'discount.idFile']);
  assert.equal(names.size, 0);
});

test('a name that is not a plain file name is never reported', () => {
  assert.deepEqual(findOrphans({ filesOnDisk: ['..', '.hidden', 'ok.png', 'a b.png'], bookings: [], reports: [] }), ['ok.png']);
});

test('the script only reads: it has no delete, unlink, move or write call', () => {
  const source = ['../scripts/listOrphanUploads.js', '../utils/orphanUploads.js'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  assert.equal(/unlink|rmSync|rename|writeFile|deleteOne|deleteMany|updateOne|updateMany|insert|--apply/.test(source.replace(/\/\/.*$/gm, '')), false);
});
