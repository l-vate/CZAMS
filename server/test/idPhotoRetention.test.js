// Run with: npm test (inside server/). The Senior/PWD ID photo is deleted 30 days after the booking is completed or cancelled, or after the
// discount request was rejected; the discount record stays; a booking that is still active is never touched; a dry run changes nothing;
// and nothing the job reports names a file or a person. No database: the job takes its models and its file store as arguments.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runIdPhotoRetention, dueReason } = require('../utils/idPhotoRetention');
const { ID_PHOTO_RETENTION_DAYS } = require('../constants/discount');
const { createMemoryStore } = require('../storage/fileStore');
const { chain } = require('./helpers/memoryQueries');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-15T04:00:00Z');
const ago = (days) => new Date(NOW.getTime() - days * DAY);

let store;
let docs;
let audits;

const FILE = (n) => `${String(n).repeat(32)}.png`;
const make = (over) => ({
  _id: `oid-${docs.length + 1}`, bookingId: `CZ-${docs.length + 1}`, status: 'Completed', completedAt: ago(40), updatedAt: ago(40),
  discount: { type: 'Senior', status: 'Approved', percent: 20, rate: 0.2, amount: 400, reviewedBy: 'ADM1', reviewedAt: ago(41), consentGiven: true, consentAt: ago(42), idFile: `/uploads/proofs/${FILE(docs.length + 1)}` },
  ...over,
});
const put = async (doc) => { await store.save({ name: doc.discount.idFile.split('/').pop(), buffer: Buffer.from('id-bytes'), contentType: 'image/png', metadata: { kind: 'id_photo' } }); return doc; };
const add = async (over) => { const doc = await put(make(over)); docs.push(doc); return doc; };
const exists = (doc) => store.exists(doc.discount.idFile ? doc.discount.idFile.split('/').pop() : '');

// a stand-in for the Booking model: a find that filters on the ID path, and a conditional updateOne
const Booking = {
  find: () => chain(docs.filter((d) => d.discount && d.discount.idFile)),
  updateOne: async (filter, update) => {
    const doc = docs.find((d) => d._id === filter._id && filter.status.$in.includes(d.status) && d.discount.idFile === filter['discount.idFile']);
    if (!doc) return { modifiedCount: 0 };
    if (update.$set) doc.discount.idFileDeletedAt = update.$set['discount.idFileDeletedAt'];
    if (update.$unset) delete doc.discount.idFile;
    return { modifiedCount: 1 };
  },
};
const audit = async (line) => { audits.push(line); };
const run = (extra = {}) => runIdPhotoRetention({ Booking, store, audit, now: NOW, retentionDays: ID_PHOTO_RETENTION_DAYS, ...extra });

test.beforeEach(() => { store = createMemoryStore(); docs = []; audits = []; });

test('the retention period is one named constant: 30 days', () => {
  assert.equal(ID_PHOTO_RETENTION_DAYS, 30);
});

test('a completed or cancelled booking more than 30 days old loses its ID photo, and keeps its discount record', async () => {
  const done = await add({ status: 'Completed', completedAt: ago(31) });
  const cancelled = await add({ status: 'Cancelled', cancelledAt: ago(45), completedAt: undefined });
  const result = await run();
  assert.deepEqual({ checked: result.checked, due: result.due, deleted: result.deleted }, { checked: 2, due: 2, deleted: 2 });
  for (const doc of [done, cancelled]) {
    assert.equal(doc.discount.idFile, undefined, 'the path is cleared');
    assert.ok(doc.discount.idFileDeletedAt, 'and the day it was deleted is recorded');
    assert.equal(doc.discount.type, 'Senior');
    assert.equal(doc.discount.reviewedBy, 'ADM1');
    assert.equal(doc.discount.rate, 0.2);
    assert.equal(doc.discount.amount, 400);
    assert.equal(doc.discount.consentGiven, true, 'the consent record stays');
  }
  assert.equal((await store.list()).length, 0, 'the files are gone from the store');
});

test('a booking ended less than 30 days ago keeps its photo', async () => {
  const recent = await add({ status: 'Completed', completedAt: ago(29) });
  const result = await run();
  assert.equal(result.deleted, 0);
  assert.ok(recent.discount.idFile);
  assert.equal(await exists(recent), true);
});

test('a rejected request is cleared 30 days after the rejection, once the booking is over', async () => {
  const rejected = await add({ status: 'Cancelled', cancelledAt: ago(5), discount: { type: 'PWD', status: 'Rejected', reviewedBy: 'ADM1', reviewedAt: ago(35), idFile: `/uploads/proofs/${FILE(9)}` } });
  const result = await run();
  assert.equal(result.deleted, 1);
  assert.equal(rejected.discount.idFile, undefined);
  assert.equal(rejected.discount.status, 'Rejected', 'the decision stays on record');
  assert.equal(audits[0].meta.reason, 'rejected');
});

test('a booking that is still active is never touched, however old the dates say it is', async () => {
  const active = [];
  for (const status of ['Pending', 'Approved', 'In Progress']) {
    active.push(await add({ status, completedAt: ago(90), cancelledAt: ago(90), updatedAt: ago(90), discount: { type: 'Senior', status: 'Rejected', reviewedAt: ago(90), idFile: `/uploads/proofs/${FILE(docs.length + 1)}` } }));
  }
  const result = await run();
  assert.equal(result.due, 0);
  assert.equal(result.deleted, 0);
  for (const doc of active) {
    assert.ok(doc.discount.idFile);
    assert.equal(await exists(doc), true);
  }
  assert.equal(audits.length, 0);
});

test('a dry run deletes nothing and changes nothing, but says how many are due', async () => {
  const a = await add({ status: 'Completed', completedAt: ago(40) });
  const b = await add({ status: 'Cancelled', cancelledAt: ago(60) });
  const result = await run({ dryRun: true });
  assert.deepEqual({ due: result.due, deleted: result.deleted, dryRun: result.dryRun }, { due: 2, deleted: 0, dryRun: true });
  assert.ok(a.discount.idFile && b.discount.idFile);
  assert.equal((await store.list()).length, 2);
  assert.equal(audits.length, 0);
});

test('only the eligible files go: a mix of old, recent and active bookings', async () => {
  const old = await add({ status: 'Completed', completedAt: ago(50) });
  const recent = await add({ status: 'Completed', completedAt: ago(3) });
  const active = await add({ status: 'Approved', completedAt: undefined, updatedAt: ago(80) });
  await run();
  assert.equal(old.discount.idFile, undefined);
  assert.ok(recent.discount.idFile);
  assert.ok(active.discount.idFile);
  assert.equal(await exists(recent), true);
  assert.equal(await exists(active), true);
  assert.equal((await store.list()).length, 2);
});

test('each deletion writes an audit line, and the lines and the result carry no file name', async () => {
  const doc = await add({ status: 'Completed', completedAt: ago(40) });
  const fileName = doc.discount.idFile.split('/').pop();
  const result = await run();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'discount.id_photo_deleted');
  assert.equal(audits[0].entityId, doc.bookingId);
  assert.equal(audits[0].actor.role, 'system');
  assert.equal(JSON.stringify(audits).includes(fileName), false);
  assert.equal(JSON.stringify(result).includes(fileName), false);
  assert.deepEqual(Object.keys(result).sort(), ['checked', 'deleted', 'dryRun', 'due']);
});

test('a second run finds nothing more to do', async () => {
  await add({ status: 'Completed', completedAt: ago(40) });
  assert.equal((await run()).deleted, 1);
  const again = await run();
  assert.deepEqual({ checked: again.checked, deleted: again.deleted }, { checked: 0, deleted: 0 });
});

test('the rule on its own', () => {
  const base = { discount: { idFile: '/uploads/proofs/x.png' } };
  assert.equal(dueReason({ ...base, status: 'Completed', completedAt: ago(30) }, NOW.getTime(), 30), 'finished', 'exactly 30 days counts');
  assert.equal(dueReason({ ...base, status: 'Completed', completedAt: ago(29) }, NOW.getTime(), 30), null);
  assert.equal(dueReason({ status: 'Completed', completedAt: ago(90), discount: {} }, NOW.getTime(), 30), null, 'no photo, nothing to do');
});

test('the job file logs counts only: no file name and no booking or person in the message', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'idPhotoRetentionJob.js'), 'utf8');
  const logs = source.split('\n').filter((line) => line.includes('console.log'));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /checked.*due.*deleted/);
  assert.doesNotMatch(logs[0], /idFile|bookingId|name|customer/);
  assert.match(source, /ID_PHOTO_RETENTION_DRY_RUN/);
});
