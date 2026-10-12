// Run with: npm test (inside server/). Real multipart uploads against a tiny local Express app, saved to a
// temporary folder. No database and no real uploads folder are touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const {
  createUploader, extensionFor, bytesMatch, IMAGE_TYPES, PHOTO_TYPES, PROOF_TYPES,
} = require('../utils/uploadSafety');

// ---- bytes of real (tiny) files, and of things pretending to be them
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(16)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cza-upload-test-'));
  const uploader = createUploader({ dir, ...options });
  const app = express();
  app.post('/one', uploader.single('file'), (req, res) => res.json({ saved: req.file.filename }));
  app.post('/two', uploader.fields([{ name: 'a', maxCount: 1 }, { name: 'b', maxCount: 1 }]), (req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (route, parts) => {
    const form = new FormData();
    parts.forEach(({ field, bytes, name, type }) => form.append(field, new File([bytes], name, { type })));
    const res = await fetch(`${base}${route}`, { method: 'POST', body: form });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    await run({ send, dir, files: () => fs.readdirSync(dir) });
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const one = (bytes, name, type) => [{ field: 'file', bytes, name, type }];

test('a real PNG is saved under a random name with a .png extension, whatever it was called', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, files }) => {
    const res = await send('/one', one(PNG, 'evil.html', 'image/png'));
    assert.equal(res.status, 200);
    assert.match(res.body.saved, /^[0-9a-f]{32}\.png$/);
    assert.deepEqual(files(), [res.body.saved]);
  });
});

test('HTML pretending to be a PNG is refused and nothing is left on disk', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, files }) => {
    const res = await send('/one', one(HTML, 'photo.png', 'image/png'));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not a real/);
    await new Promise((r) => setTimeout(r, 50)); // the unlink is asynchronous
    assert.deepEqual(files(), []);
  });
});

test('SVG is refused, both honestly labelled and disguised as a JPEG', async () => {
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, files }) => {
    const honest = await send('/one', one(SVG, 'logo.svg', 'image/svg+xml'));
    assert.equal(honest.status, 400);
    assert.match(honest.body.message, /Only JPG, PNG or WEBP files are allowed/);
    const disguised = await send('/one', one(SVG, 'logo.jpg', 'image/jpeg'));
    assert.equal(disguised.status, 400);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(files(), []);
  });
});

test('an HTML file labelled text/html is refused', async () => {
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, files }) => {
    const res = await send('/one', one(HTML, 'page.html', 'text/html'));
    assert.equal(res.status, 400);
    assert.deepEqual(files(), []);
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
    assert.ok(files().some((f) => f.endsWith('.pdf')));
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
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(files(), []);
  });
});

test('when one of two uploaded files is bad, both are removed', async () => {
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, files }) => {
    const res = await send('/two', [
      { field: 'a', bytes: PNG, name: 'good.png', type: 'image/png' },
      { field: 'b', bytes: HTML, name: 'bad.png', type: 'image/png' },
    ]);
    assert.equal(res.status, 400);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(files(), []);
  });
});
