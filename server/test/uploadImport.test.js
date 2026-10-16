// Run with: npm test (inside server/). The import of disk uploads into the file store: the dry run report, the metadata worked out from the
// records, that running it twice copies nothing new, and that nothing is ever deleted. Uses the in-memory store, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryStore } = require('../storage/fileStore');
const { referenceMap, planImport, applyImport, describePlan } = require('../utils/uploadImport');

const P = (name) => `/uploads/proofs/${name}`;
const N = (letter, ext = 'png') => `${letter.repeat(32)}.${ext}`;

const bookings = [{
  bookingId: 'CZ-1', proofFile: P(N('a')), balanceProofFile: P(N('b')), discount: { idFile: P(N('c', 'jpg')) },
  refund: { proofFile: P(N('d', 'pdf')) }, unitPurchaseProof: P(N('e', 'webp')),
}];
const reports = [{ bookingId: 'CZ-2', signedFormPhoto: P(N('f')) }];
const users = [{ profileImage: '/uploads/profile-images/' + N('g') }, { profileImage: null }, {}];
const disk = [
  { name: N('a'), folder: 'proofs', size: 1000 }, { name: N('b'), folder: 'proofs', size: 2000 }, { name: N('c', 'jpg'), folder: 'proofs', size: 3000 },
  { name: N('d', 'pdf'), folder: 'proofs', size: 4000 }, { name: N('e', 'webp'), folder: 'proofs', size: 5000 }, { name: N('f'), folder: 'proofs', size: 6000 },
  { name: N('g'), folder: 'profile-images', size: 7000 },
  { name: N('h'), folder: 'proofs', size: 800 }, // nothing refers to it
  { name: 'old-upload.html', folder: 'proofs', size: 90 }, // an unknown extension, and nothing refers to it
  { name: '..%2Fx.png', folder: 'proofs', size: 10 }, // not a valid file name
];
const references = () => referenceMap({ bookings, reports, users });

test('the references say what kind of file each name is, and which booking it belongs to', () => {
  const refs = references();
  assert.deepEqual(refs.get(N('a')), { kind: 'proof', bookingId: 'CZ-1' });
  assert.deepEqual(refs.get(N('b')), { kind: 'proof', bookingId: 'CZ-1' });
  assert.deepEqual(refs.get(N('c', 'jpg')), { kind: 'id_photo', bookingId: 'CZ-1' });
  assert.deepEqual(refs.get(N('d', 'pdf')), { kind: 'refund_proof', bookingId: 'CZ-1' });
  assert.deepEqual(refs.get(N('e', 'webp')), { kind: 'purchase_proof', bookingId: 'CZ-1' });
  assert.deepEqual(refs.get(N('f')), { kind: 'signed_form', bookingId: 'CZ-2' });
  assert.deepEqual(refs.get(N('g')), { kind: 'profile_image', bookingId: null });
});

test('the dry run counts everything and changes nothing', async () => {
  const store = createMemoryStore();
  await store.save({ name: N('a'), buffer: Buffer.from('already'), contentType: 'image/png', metadata: { kind: 'proof' } });
  const before = await store.list();
  const plan = planImport({ disk, inStore: new Set((await store.list()).map((f) => f.name)), references: references() });
  assert.equal(plan.total, 10);
  assert.equal(plan.totalBytes, 1000 + 2000 + 3000 + 4000 + 5000 + 6000 + 7000 + 800 + 90 + 10);
  assert.deepEqual(plan.alreadyInStore, [N('a')]);
  assert.deepEqual(plan.unknownExtensions, ['old-upload.html']);
  assert.deepEqual(plan.unreferenced, [N('h'), 'old-upload.html']);
  assert.deepEqual(plan.invalidNames, ['..%2Fx.png']);
  assert.equal(plan.toCopy.length, 8);
  assert.equal(plan.bytesToCopy, 2000 + 3000 + 4000 + 5000 + 6000 + 7000 + 800 + 90);
  assert.equal(plan.toCopy.find((f) => f.name === N('h')).kind, 'legacy', 'a file nothing refers to becomes legacy');
  assert.equal(plan.toCopy.find((f) => f.name === N('g')).kind, 'profile_image');
  assert.deepEqual(await store.list(), before, 'planning wrote nothing');
});

test('the report is counts and names, never contents', () => {
  const plan = planImport({ disk, inStore: new Set(), references: references() });
  const text = describePlan(plan).join('\n');
  assert.match(text, /Files on disk: 10/);
  assert.match(text, /Unknown extension: 1: old-upload\.html/);
  assert.match(text, /To copy: 9/);
});

test('applying copies the files with metadata from the records, and keeps the name, the type and the size', async () => {
  const store = createMemoryStore();
  const plan = planImport({ disk, inStore: new Set(), references: references() });
  const bytes = (file) => Buffer.from(`bytes of ${file.name}`);
  const result = await applyImport({ plan, store, readFile: async (file) => bytes(file) });
  assert.deepEqual(result, { copied: 9, skippedExisting: 0, failed: [] });
  const proof = await store.open(N('b'));
  assert.deepEqual(proof.metadata, { kind: 'proof', uploadedBy: null, bookingId: 'CZ-1', size: bytes({ name: N('b') }).length, contentType: 'image/png' });
  assert.equal((await store.open(N('d', 'pdf'))).contentType, 'application/pdf');
  assert.equal((await store.open('old-upload.html')).contentType, 'application/octet-stream');
  assert.equal(await store.exists('..%2Fx.png'), false);
});

test('running it again copies nothing new and overwrites nothing', async () => {
  const store = createMemoryStore();
  const first = planImport({ disk, inStore: new Set(), references: references() });
  await applyImport({ plan: first, store, readFile: async () => Buffer.from('original') });
  const second = planImport({ disk, inStore: new Set((await store.list()).map((f) => f.name)), references: references() });
  assert.equal(second.toCopy.length, 0);
  assert.equal(second.alreadyInStore.length, 9);
  const result = await applyImport({ plan: second, store, readFile: async () => Buffer.from('changed') });
  assert.deepEqual(result, { copied: 0, skippedExisting: 0, failed: [] });

  // a stale plan (made before another run saved the names) still skips them instead of failing or overwriting
  const stale = await applyImport({ plan: first, store, readFile: async () => Buffer.from('changed') });
  assert.deepEqual(stale, { copied: 0, skippedExisting: 9, failed: [] });
  const chunks = [];
  for await (const c of (await store.open(N('a'))).stream) chunks.push(c);
  assert.equal(Buffer.concat(chunks).toString(), 'original');
});

test('a file that cannot be read is reported as failed and the others still copy', async () => {
  const store = createMemoryStore();
  const plan = planImport({ disk: disk.slice(0, 3), inStore: new Set(), references: references() });
  const result = await applyImport({
    plan, store, readFile: async (file) => { if (file.name === N('b')) throw new Error('cannot read'); return Buffer.from('x'); },
  });
  assert.equal(result.copied, 2);
  assert.deepEqual(result.failed, [{ name: N('b'), reason: 'cannot read' }]);
});

test('the script and its helper never delete, move or change a disk file, and --apply needs the backup flag', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\/.*$/gm, '');
  const source = [read('../scripts/importUploadsToStore.js'), read('../utils/uploadImport.js')].join('\n');
  assert.equal(/unlink|rmSync|\brm\(|rename|writeFile|appendFile|truncate|\.remove\(|deleteOne|deleteMany/.test(source), false);
  assert.match(read('../scripts/importUploadsToStore.js'), /--i-have-a-backup/);
});
