// Run with: npm test (inside server/). The read only backup: one JSON file per collection with dates and ids kept, a timestamped folder
// outside the project, a refusal inside the project, and no write call on the database. Stubbed database; nothing connects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ObjectId, EJSON } = require('bson');
const { backupDatabase, backupFolder } = require('../utils/backupToJson');

// a database that only knows how to list and find; any other call on a collection is recorded
function fakeDb(data) {
  const touched = [];
  const collection = (name) => new Proxy({
    find: () => (async function* () { for (const d of data[name]) yield d; })(),
  }, { get: (t, k) => { if (!(k in t)) touched.push(`${name}.${String(k)}`); return t[k]; } });
  return {
    touched,
    listCollections: () => ({
      toArray: async () => [
        ...Object.keys(data).map((name) => ({ name, type: 'collection' })),
        { name: 'someView', type: 'view' },
        { name: 'system.views', type: 'collection' },
      ],
    }),
    collection,
  };
}

test('every collection is written to its own EJSON file, dates and ids survive, and only counts are reported', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'czams-backup-'));
  const id = new ObjectId();
  const when = new Date('2026-01-02T03:04:05.000Z');
  const db = fakeDb({
    bookings: [{ _id: id, at: when }, { _id: new ObjectId(), at: when }],
    empty: [],
    'uploads.files': [{ _id: id }],
    'uploads.chunks': [{ _id: id, data: Buffer.from('abc') }],
  });
  const logged = [];
  try {
    const { folder, collections } = await backupDatabase(db, { baseDir: base, date: new Date('2026-10-16T09:05:03Z'), log: (l) => logged.push(l) });
    assert.equal(path.basename(folder), 'CZAMS-2026-10-16_09-05-03');
    assert.deepEqual(collections, [
      { name: 'bookings', count: 2 }, { name: 'empty', count: 0 }, { name: 'uploads.chunks', count: 1 }, { name: 'uploads.files', count: 1 },
    ]);
    assert.deepEqual(fs.readdirSync(folder).sort(), ['bookings.json', 'empty.json', 'uploads.chunks.json', 'uploads.files.json']);
    const back = EJSON.parse(fs.readFileSync(path.join(folder, 'bookings.json'), 'utf8'));
    assert.ok(back[0]._id instanceof ObjectId && back[0]._id.equals(id));
    assert.equal(back[0].at.getTime(), when.getTime());
    assert.deepEqual(EJSON.parse(fs.readFileSync(path.join(folder, 'empty.json'), 'utf8')), []);
    assert.equal(logged.some((l) => /abc|ObjectId|\$oid/.test(l)), false, 'no document contents in the output');
    assert.deepEqual(db.touched, [], 'nothing but find was used on the collections');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a folder inside the project is refused, and one outside is accepted', () => {
  const root = path.join(os.tmpdir(), 'fake-project');
  assert.throws(() => backupFolder(path.join(root, 'backups'), new Date(), root), /inside the project/);
  assert.throws(() => backupFolder(root, new Date(), root), /inside the project/);
  assert.match(backupFolder(path.join(os.tmpdir(), 'elsewhere'), new Date(), root), /CZAMS-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
});

test('the real project folder is refused by default', () => {
  assert.throws(() => backupFolder(path.join(__dirname, '..', '..', 'backups')), /inside the project/);
});
