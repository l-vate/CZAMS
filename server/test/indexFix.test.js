// Run with: npm test (inside server/). The start-up warning when an index could not be built, and the reports index fix: with no old index,
// with an old plain index and no duplicates, and with an old index and duplicates (which it must refuse to touch). Stubbed collections only;
// nothing connects to a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { watchIndexes, indexNameFrom } = require('../utils/indexWatch');
const { inspect, decide, applyFix } = require('../utils/reportsIndex');

// a collection that remembers what was done to it
function fakeCollection({ indexes = [{ key: { _id: 1 }, name: '_id_' }], duplicates = [] } = {}) {
  const calls = [];
  return {
    calls,
    indexes: async () => indexes,
    aggregate: () => ({ toArray: async () => duplicates }),
    dropIndex: async (name) => { calls.push(['dropIndex', name]); },
    createIndex: async (key, options) => { calls.push(['createIndex', key, options]); },
  };
}
const plain = { key: { bookingId: 1 }, name: 'bookingId_1', v: 2 };
const unique = { key: { bookingId: 1 }, name: 'bookingId_1', v: 2, unique: true };

test('an index that cannot be built is warned about once, naming the collection and the index, and nothing else', async () => {
  const warnings = [];
  const conflict = new Error('An existing index has the same name as the requested index. Requested index: { v: 2, unique: true, key: { bookingId: 1 }, name: "bookingId_1" }, existing index: { v: 2, key: { bookingId: 1 }, name: "bookingId_1" }');
  const models = [
    { modelName: 'Report', collection: { name: 'reports' }, init: async () => { throw conflict; } },
    { modelName: 'Report', collection: { name: 'reports' }, init: async () => { throw conflict; } }, // the same collection again: one warning
    { modelName: 'Booking', collection: { name: 'bookings' }, init: async () => {} },
  ];
  const warned = await watchIndexes(models, { warn: (m) => warnings.push(m) });
  assert.deepEqual(warned, ['reports']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /collection "reports" \(bookingId_1\) could not be built/);
  assert.match(warnings[0], /fixReportsIndex\.js/);
  assert.equal(/mongodb|password|@|\{/.test(warnings[0]), false, 'no connection string and no data');
});

test('every index built: no warning, and a failing model never stops the others', async () => {
  const warnings = [];
  const ok = { modelName: 'A', collection: { name: 'a' }, init: async () => {} };
  assert.deepEqual(await watchIndexes([ok], { warn: (m) => warnings.push(m) }), []);
  const bad = { modelName: 'B', collection: { name: 'b' }, init: async () => { throw new Error('boom'); } };
  assert.deepEqual(await watchIndexes([bad, ok], { warn: (m) => warnings.push(m) }), ['b']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /collection "b"/);
});

test('the index name is read from the driver message or the key pattern', () => {
  assert.equal(indexNameFrom(new Error('x name: "bookingId_1" y')), 'bookingId_1');
  assert.equal(indexNameFrom(Object.assign(new Error('E11000'), { keyPattern: { bookingId: 1 } })), 'bookingId_1');
  assert.equal(indexNameFrom(new Error('nothing')), null);
  assert.equal(indexNameFrom(null), null);
});

test('no old index: it would build the unique one', async () => {
  const c = fakeCollection();
  const state = await inspect(c);
  assert.equal(decide(state), 'build');
  const result = await applyFix(c, state);
  assert.deepEqual(c.calls, [['createIndex', { bookingId: 1 }, { unique: true }]]);
  assert.deepEqual(result.done, ['built the unique bookingId index']);
});

test('an old plain index and no duplicates: it drops only that index, then builds the unique one', async () => {
  const c = fakeCollection({ indexes: [{ key: { _id: 1 }, name: '_id_' }, plain, { key: { technicianId: 1 }, name: 'technicianId_1' }] });
  const state = await inspect(c);
  assert.equal(state.plain.name, 'bookingId_1');
  assert.equal(decide(state), 'replace');
  await applyFix(c, state);
  assert.deepEqual(c.calls, [['dropIndex', 'bookingId_1'], ['createIndex', { bookingId: 1 }, { unique: true }]]);
});

test('an old index and duplicates: nothing is changed, the duplicates are listed', async () => {
  const duplicates = [{ _id: 'CZ-1', count: 2, reportIds: ['r1', 'r2'] }];
  const c = fakeCollection({ indexes: [plain], duplicates });
  const state = await inspect(c);
  assert.equal(decide(state), 'blocked');
  assert.deepEqual(state.duplicates, duplicates);
  const result = await applyFix(c, state);
  assert.deepEqual(c.calls, [], 'no index was dropped or built');
  assert.deepEqual(result.done, []);
});

test('an index that is already unique is left alone', async () => {
  const c = fakeCollection({ indexes: [unique] });
  const state = await inspect(c);
  assert.equal(decide(state), 'ok');
  await applyFix(c, state);
  assert.deepEqual(c.calls, []);
});

test('the script is a dry run by default, refuses --apply without the backup flag, and never prints the connection string', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'fixReportsIndex.js'), 'utf8');
  assert.match(source, /--i-have-a-backup/);
  assert.match(source, /Refusing to run with --apply/);
  assert.match(source, /Dry run: nothing was changed/);
  assert.equal(/console\.(log|error)\([^)]*MONGO_URI/.test(source), false);
});
