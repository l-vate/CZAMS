// Run with: npm test (inside server/). Real multipart uploads against a tiny local Express app, stored in an in-memory file store.
// No database and no real uploads folder are touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  createUploader, storeUploads, discardUploads, extensionFor, bytesMatch, IMAGE_TYPES, PHOTO_TYPES, PROOF_TYPES,
} = require('../utils/uploadSafety');
const { createMemoryStore, setStore, KINDS } = require('../storage/fileStore');

// ---- bytes of real (tiny) files, and of things pretending to be them
const { REAL_PNG: PNG, REAL_JPG: JPG, REAL_WEBP: WEBP, REAL_PDF: PDF } = require('./helpers/images');
const HTML = Buffer.from('<html><script>alert(document.cookie)</script></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

// ---- the pure rules
test('the stored extension comes from the validated type, never from a file name', () => {
  assert.equal(extensionFor('image/png'), '.png');
  assert.equal(extensionFor('image/jpeg'), '.jpg');
  assert.equal(extensionFor('image/webp'), '.webp');
  assert.equal(extensionFor('application/pdf'), '.pdf');
  assert.equal(extensionFor('image/svg+xml'), undefined);
  assert.equal(extensionFor('text/html'), undefined);
});

test('magic numbers: each type matches only its own first bytes', () => {
  assert.equal(bytesMatch('image/png', PNG), true);
  assert.equal(bytesMatch('image/jpeg', JPG), true);
  assert.equal(bytesMatch('image/webp', WEBP), true);
  assert.equal(bytesMatch('application/pdf', PDF), true);
  assert.equal(bytesMatch('image/png', JPG), false);
  assert.equal(bytesMatch('image/jpeg', PNG), false);
  assert.equal(bytesMatch('image/png', HTML), false);
  assert.equal(bytesMatch('image/jpeg', SVG), false);
  assert.equal(bytesMatch('image/png', Buffer.alloc(0)), false);
  assert.equal(bytesMatch('image/png', PNG.subarray(0, 4)), false); // truncated
  assert.equal(bytesMatch('image/svg+xml', SVG), false); // not an accepted type at all
});

// ---- real uploads
async function withApp(options, run) {
  const store = createMemoryStore();
  setStore(store);
  const uploader = createUploader(options);
  const app = express();
  // like a route: the file is stored once the request has passed, so a refused upload never reaches the store
  app.post('/one', uploader.single('file'), async (req, res) => { await storeUploads(req, { kind: KINDS.PROOF }); res.json({ saved: req.file.filename }); });
  app.post('/two', uploader.fields([{ name: 'a', maxCount: 1 }, { name: 'b', maxCount: 1 }]), async (req, res) => { await storeUploads(req, { kind: KINDS.PROOF }); res.json({ ok: true }); });
  app.post('/fail', uploader.single('file'), async (req, res) => { await storeUploads(req, { kind: KINDS.PROOF }); await discardUploads(req); res.status(500).json({ message: 'save failed' }); });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (route, parts) => {
    const form = new FormData();
    parts.forEach(({ field, bytes, name, type }) => form.append(field, new File([bytes], name, { type })));
    const res = await fetch(`${base}${route}`, { method: 'POST', body: form });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    await run({ send, files: async () => (await store.list()).map((f) => f.name), store });
  } finally {
    server.close();
    setStore(null);
  }
}

const one = (bytes, name, type) => [{ field: 'file', bytes, name, type }];

test('a real PNG is cleaned, re-encoded as a JPEG and saved under a random name with a .jpg extension, whatever it was called', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, files }) => {
    const res = await send('/one', one(PNG, 'evil.html', 'image/png'));
    assert.equal(res.status, 200);
    assert.match(res.body.saved, /^[0-9a-f]{32}\.jpg$/);
    assert.deepEqual(await files(), [res.body.saved]);
  });
});

test('HTML pretending to be a PNG is refused before anything is stored', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, files }) => {
    const res = await send('/one', one(HTML, 'photo.png', 'image/png'));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not a real/);
    assert.deepEqual(await files(), []);
  });
});

test('SVG is refused, both honestly labelled and disguised as a JPEG', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, files }) => {
    const honest = await send('/one', one(SVG, 'logo.svg', 'image/svg+xml'));
    assert.equal(honest.status, 400);
    assert.match(honest.body.message, /Only JPG, PNG or WEBP files are allowed/);
    const disguised = await send('/one', one(SVG, 'logo.jpg', 'image/jpeg'));
    assert.equal(disguised.status, 400);
    assert.deepEqual(await files(), []);
  });
});

test('an HTML file labelled text/html is refused', async () => {
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, files }) => {
    const res = await send('/one', one(HTML, 'page.html', 'text/html'));
    assert.equal(res.status, 400);
    assert.deepEqual(await files(), []);
  });
});

test('a JPEG labelled as a PNG fails the byte check', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send }) => {
    assert.equal((await send('/one', one(JPG, 'a.png', 'image/png'))).status, 400);
    assert.equal((await send('/one', one(JPG, 'a.jpg', 'image/jpeg'))).status, 200);
  });
});

test('the report photo accepts JPG and PNG only', async () => {
  await withApp({ allowedTypes: PHOTO_TYPES }, async ({ send }) => {
    assert.equal((await send('/one', one(JPG, 'a.jpg', 'image/jpeg'))).status, 200);
    assert.equal((await send('/one', one(PNG, 'a.png', 'image/png'))).status, 200);
    assert.equal((await send('/one', one(WEBP, 'a.webp', 'image/webp'))).status, 400);
    assert.equal((await send('/one', one(PDF, 'a.pdf', 'application/pdf'))).status, 400);
  });
});

test('proofs also accept WEBP and PDF; profile photos do not accept PDF', async () => {
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, files }) => {
    assert.equal((await send('/one', one(WEBP, 'a.webp', 'image/webp'))).status, 200);
    assert.equal((await send('/one', one(PDF, 'receipt.pdf', 'application/pdf'))).status, 200);
    assert.ok((await files()).some((f) => f.endsWith('.pdf')));
  });
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send }) => {
    assert.equal((await send('/one', one(PDF, 'receipt.pdf', 'application/pdf'))).status, 400);
  });
});

test('a file over the size limit is a 400 about size, not a server error', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES, maxBytes: 1024 }, async ({ send, files }) => {
    const big = Buffer.concat([PNG, Buffer.alloc(4096)]);
    const res = await send('/one', one(big, 'big.png', 'image/png'));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /smaller/);
    assert.deepEqual(await files(), []);
  });
});

test('when one of two uploaded files is bad, neither is stored', async () => {
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, files }) => {
    const res = await send('/two', [
      { field: 'a', bytes: PNG, name: 'good.png', type: 'image/png' },
      { field: 'b', bytes: HTML, name: 'bad.png', type: 'image/png' },
    ]);
    assert.equal(res.status, 400);
    assert.deepEqual(await files(), []);
  });
});

test('a stored file keeps its kind, size and detected type, and not the name the client sent', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, store }) => {
    const res = await send('/one', one(PNG, 'my-private-id-card.png', 'image/png'));
    const stored = await store.open(res.body.saved);
    assert.equal(stored.contentType, 'image/jpeg', 'a picture is stored as the JPEG it was cleaned into');
    assert.equal(stored.size, (await store.list())[0].size);
    assert.equal(stored.metadata.kind, 'proof');
    assert.equal(JSON.stringify(stored.metadata).includes('my-private'), false);
  });
});

test('a request that fails after storing removes its file', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, files }) => {
    const res = await send('/fail', one(PNG, 'a.png', 'image/png'));
    assert.equal(res.status, 500);
    assert.deepEqual(await files(), []);
  });
});
