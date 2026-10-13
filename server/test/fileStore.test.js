// Run with: npm test (inside server/). The file store interface, run against the in-memory store and against a disk store in a temporary
// folder (so the same contract holds for both), and the choice of store from the environment. GridFS itself needs a database and is
// listed as not tested here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  KINDS, FileExistsError, createMemoryStore, createDiskStore, createGridFsStore, withLegacyDisk, chooseStoreName, legacyFallbackEnabled,
} = require('../storage/fileStore');

const NAME = '0123456789abcdef0123456789abcdef.png';
const PDF_NAME = 'ffffffffffffffffffffffffffffffff.pdf';
const BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const read = async (stream) => { const chunks = []; for await (const c of stream) chunks.push(c); return Buffer.concat(chunks); };
const put = (store, name = NAME, metadata = { kind: KINDS.PROOF }) => store.save({ name, buffer: BYTES, contentType: 'image/png', metadata });

const stores = {
  memory: () => ({ store: createMemoryStore(), done: () => {} }),
  disk: () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'czams-store-'));
    return { store: createDiskStore({ root }), done: () => fs.rmSync(root, { recursive: true, force: true }) };
  },
};

Object.entries(stores).forEach(([label, make]) => {
  test.describe(`${label} store`, () => {
    let store;
    let done;
    test.beforeEach(() => { ({ store, done } = make()); });
    test.afterEach(() => done());

    test('save then open gives the same bytes, the type and the size', async () => {
      const saved = await put(store, NAME, { kind: KINDS.PROOF, uploadedBy: 'CUS1', bookingId: 'CZ-1' });
      assert.deepEqual(saved, { name: NAME, size: BYTES.length });
      const opened = await store.open(NAME);
      assert.deepEqual(await read(opened.stream), BYTES);
      assert.equal(opened.contentType, 'image/png');
      assert.equal(opened.size, BYTES.length);
    });

    test('exists is true after save and false after remove; removing twice is fine', async () => {
      assert.equal(await store.exists(NAME), false);
      await put(store);
      assert.equal(await store.exists(NAME), true);
      assert.equal(await store.remove(NAME), true);
      assert.equal(await store.exists(NAME), false);
      assert.equal(await store.remove(NAME), false);
    });

    test('a name that is already taken is refused and the first file is kept', async () => {
      await put(store);
      await assert.rejects(store.save({ name: NAME, buffer: Buffer.from('other'), contentType: 'image/png', metadata: { kind: KINDS.PROOF } }), FileExistsError);
      assert.deepEqual(await read((await store.open(NAME)).stream), BYTES);
    });

    test('a missing file opens as null, does not exist, and removes as false', async () => {
      assert.equal(await store.open(NAME), null);
      assert.equal(await store.exists(NAME), false);
      assert.equal(await store.remove(NAME), false);
    });

    test('a name that could leave the folder is refused or not found, never touched', async () => {
      for (const bad of ['../x.png', '..\\x.png', 'a/b.png', '.hidden', '', 'x'.repeat(200)]) {
        assert.equal(await store.open(bad), null, bad);
        assert.equal(await store.exists(bad), false, bad);
        assert.equal(await store.remove(bad), false, bad);
        await assert.rejects(store.save({ name: bad, buffer: BYTES, contentType: 'image/png' }), /valid file name/, bad);
      }
    });

    test('list names every file with its size', async () => {
      await put(store);
      await store.save({ name: PDF_NAME, buffer: Buffer.from('%PDF-1'), contentType: 'application/pdf', metadata: { kind: KINDS.REFUND_PROOF } });
      const listed = await store.list();
      assert.deepEqual(listed.map((f) => [f.name, f.size]), [[NAME, BYTES.length], [PDF_NAME, 6]]);
    });
  });
});

test('the memory store keeps only the allowed metadata, never a client file name', async () => {
  const store = createMemoryStore();
  await put(store, NAME, { kind: KINDS.ID_PHOTO, uploadedBy: 'CUS1', bookingId: 'CZ-1', originalName: 'my-id.png', originalname: 'x', extra: 'y' });
  const { metadata } = await store.open(NAME);
  assert.deepEqual(metadata, { kind: 'id_photo', uploadedBy: 'CUS1', bookingId: 'CZ-1', size: BYTES.length, contentType: 'image/png' });
  assert.equal(JSON.stringify(metadata).includes('my-id'), false);
});

test('an unknown or missing kind is stored as legacy', async () => {
  const store = createMemoryStore();
  await put(store, NAME, { kind: 'something' });
  assert.equal((await store.open(NAME)).metadata.kind, 'legacy');
});

test('the disk store puts profile images and proofs in their old folders, so old paths still line up', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'czams-store-'));
  try {
    const store = createDiskStore({ root });
    const other = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png';
    await put(store, NAME, { kind: KINDS.PROFILE_IMAGE });
    await put(store, other, { kind: KINDS.PROOF });
    assert.ok(fs.existsSync(path.join(root, 'profile-images', NAME)));
    assert.ok(fs.existsSync(path.join(root, 'proofs', other)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the store is chosen from FILE_STORE, with gridfs the default in production and disk otherwise', () => {
  assert.equal(chooseStoreName({ NODE_ENV: 'production' }), 'gridfs');
  assert.equal(chooseStoreName({ NODE_ENV: 'production', FILE_STORE: 'disk' }), 'disk');
  assert.equal(chooseStoreName({ NODE_ENV: 'development' }), 'disk');
  assert.equal(chooseStoreName({}), 'disk');
  assert.equal(chooseStoreName({ FILE_STORE: 'gridfs' }), 'gridfs');
  assert.equal(chooseStoreName({ FILE_STORE: ' GridFS ' }), 'gridfs');
  assert.equal(chooseStoreName({ NODE_ENV: 'production', FILE_STORE: 'nonsense' }), 'gridfs');
  assert.equal(chooseStoreName({ FILE_STORE: 'nonsense' }), 'disk');
});

test('the legacy disk fallback is on outside production and off in production', () => {
  assert.equal(legacyFallbackEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(legacyFallbackEnabled({}), true);
  assert.equal(legacyFallbackEnabled({ NODE_ENV: 'production' }), false);
});

test('with the fallback, reads try the primary then the legacy store, and writes and removes touch only the primary', async () => {
  const primary = createMemoryStore();
  const legacy = createMemoryStore();
  const both = withLegacyDisk(primary, legacy);
  await put(legacy);
  assert.equal(await both.exists(NAME), true);
  assert.deepEqual(await read((await both.open(NAME)).stream), BYTES);
  assert.equal(await both.remove(NAME), false, 'the legacy file is not removed through the primary');
  assert.equal(await legacy.exists(NAME), true);
  const other = 'dddddddddddddddddddddddddddddddd.png';
  await put(both, other);
  assert.equal(await primary.exists(other), true);
  assert.equal(await legacy.exists(other), false);
});

test('the GridFS store says clearly when the database is not connected', async () => {
  const store = createGridFsStore({ getDb: () => null, mongo: {} });
  await assert.rejects(store.exists(NAME), /not connected/);
});
