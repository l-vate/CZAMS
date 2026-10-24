// Run with: npm test (inside server/). E15-4: every uploaded picture is cleaned before it is stored (utils/imageProcessing.js, wired into
// utils/uploadSafety.js): longest side at most 1600 px, JPEG at about 80 percent, no metadata at all (the GPS position above all). A PDF
// is stored as it came. The real type is read from the bytes. The real middleware runs in a tiny Express app with an in-memory file store.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const express = require('express');
const sharp = require('sharp');
const { createUploader, storeUploads, IMAGE_TYPES, PROOF_TYPES, MAX_UPLOAD_BYTES } = require('../utils/uploadSafety');
const { cleanImage, MAX_SIDE, JPEG_QUALITY } = require('../utils/imageProcessing');
const { createMemoryStore, setStore, KINDS } = require('../storage/fileStore');
const { REAL_PNG, REAL_PDF } = require('./helpers/images');

const MB = 1024 * 1024;

async function withApp(options, run) {
  const store = createMemoryStore();
  setStore(store);
  const uploader = createUploader(options);
  const app = express();
  app.post('/one', uploader.single('file'), async (req, res) => {
    await storeUploads(req, { kind: KINDS.PROOF });
    res.json({ saved: req.file.filename, type: req.file.mimetype });
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (bytes, name, type) => {
    const form = new FormData();
    form.append('file', new File([bytes], name, { type }));
    const res = await fetch(`${base}/one`, { method: 'POST', body: form });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    await run({ send, read: async (name) => { const f = await store.open(name); const chunks = []; for await (const c of f.stream) chunks.push(c); return { bytes: Buffer.concat(chunks), file: f }; }, store });
  } finally {
    server.close();
    setStore(null);
  }
}

// A busy picture, so it does not compress to nothing (a flat one would shrink for the wrong reason). Random noise on a gradient.
async function phonePhoto({ width = 4032, height = 3024, quality = 95, noise = 25, exif } = {}) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = ((i % width) * 255 / width + Math.random() * noise) & 255;
  let image = sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality });
  if (exif) image = image.withExif(exif);
  return image.toBuffer();
}

const GPS = { IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '14/1 35/1 12/1', GPSLongitudeRef: 'E', GPSLongitude: '121/1 3/1 30/1' } };

test('an oversized phone photo is shrunk to 1600 px on its longest side and stored as a much smaller JPEG', async () => {
  const photo = await phonePhoto({ width: 4032, height: 3024, quality: 95 });
  assert.ok(photo.length > 1.5 * MB, `the test photo is ${(photo.length / MB).toFixed(1)} MB`);
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, read }) => {
    const res = await send(photo, 'IMG_2041.JPG', 'image/jpeg');
    assert.equal(res.status, 200);
    assert.match(res.body.saved, /^[0-9a-f]{32}\.jpg$/);
    const { bytes, file } = await read(res.body.saved);
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.format, 'jpeg');
    assert.equal(Math.max(meta.width, meta.height), MAX_SIDE);
    assert.equal(meta.width, 1600);
    assert.equal(meta.height, 1200, 'the shape is kept');
    assert.ok(bytes.length < photo.length / 3, `${photo.length} bytes became ${bytes.length}`);
    assert.equal(file.contentType, 'image/jpeg');
  });
});

test('a small picture is not enlarged', async () => {
  const small = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 120, b: 200 } } }).jpeg().toBuffer();
  const cleaned = await cleanImage(small);
  assert.equal(cleaned.width, 640);
  assert.equal(cleaned.height, 480);
});

test('the GPS position and every other piece of EXIF metadata is removed', async () => {
  const photo = await phonePhoto({ width: 800, height: 600, exif: { ...GPS, IFD0: { Make: 'SecretPhoneMaker', Model: 'SecretModel 9' } } });
  const before = await sharp(photo).metadata();
  assert.ok(before.exif && before.exif.length > 0, 'the test photo really carries EXIF');
  assert.ok(photo.includes(Buffer.from('SecretPhoneMaker')), 'and the phone make is in its bytes');
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, read }) => {
    const res = await send(photo, 'with-gps.jpg', 'image/jpeg');
    assert.equal(res.status, 200);
    const { bytes } = await read(res.body.saved);
    const after = await sharp(bytes).metadata();
    assert.equal(after.exif, undefined, 'no EXIF block is left');
    assert.equal(after.icc, undefined);
    assert.equal(bytes.includes(Buffer.from('SecretPhoneMaker')), false, 'the phone make is gone');
    assert.equal(bytes.includes(Buffer.from('SecretModel')), false);
    assert.equal(bytes.includes(Buffer.from('Exif')), false, 'there is no Exif marker at all');
    assert.equal(bytes.includes(Buffer.from('GPS')), false);
  });
});

test('a picture taken sideways is turned upright before its orientation tag is dropped', async () => {
  const sideways = await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 90, g: 90, b: 90 } } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.equal((await sharp(sideways).metadata()).orientation, 6);
  const cleaned = await cleanImage(sideways);
  assert.equal(cleaned.width, 100);
  assert.equal(cleaned.height, 200);
  assert.equal((await sharp(cleaned.buffer).metadata()).orientation, undefined);
});

test('a PNG with see-through parts is stored as a JPEG on white, and a WEBP too', async () => {
  const clear = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const cleaned = await cleanImage(clear);
  assert.equal(cleaned.mimetype, 'image/jpeg');
  const { data } = await sharp(cleaned.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240 && data[1] > 240 && data[2] > 240, 'the see-through part became white');
  const webp = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 200, g: 0, b: 0 } } }).webp().toBuffer();
  assert.equal((await sharp((await cleanImage(webp)).buffer).metadata()).format, 'jpeg');
});

test('the quality setting is about 80 percent', () => {
  assert.equal(JPEG_QUALITY, 80);
  assert.equal(MAX_SIDE, 1600);
});

test('a PDF is stored exactly as it came, with its own type', async () => {
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, read }) => {
    const res = await send(REAL_PDF, 'receipt.pdf', 'application/pdf');
    assert.equal(res.status, 200);
    assert.match(res.body.saved, /^[0-9a-f]{32}\.pdf$/);
    assert.equal(res.body.type, 'application/pdf');
    const { bytes } = await read(res.body.saved);
    assert.equal(bytes.equals(REAL_PDF), true, 'not a byte changed');
  });
});

test('a file with an image name but not image bytes is refused, whatever the browser called it', async () => {
  const html = Buffer.from('<html><script>alert(document.cookie)</script></html>');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'latin1');
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, store }) => {
    for (const [bytes, name, type] of [[html, 'photo.png', 'image/png'], [svg, 'photo.jpg', 'image/jpeg'], [gif, 'photo.png', 'image/png'], [Buffer.from('plain text'), 'photo.webp', 'image/webp'], [REAL_PDF, 'photo.png', 'image/png']]) {
      const res = await send(bytes, name, type);
      assert.equal(res.status, 400, `${name} with ${type}`);
      assert.match(res.body.message, /not a real|could not be read|Only/);
    }
    assert.deepEqual(await store.list(), [], 'nothing was stored');
  });
});

test('a file that starts like a PNG but is not a picture is refused as unreadable, and nothing is stored', async () => {
  const fake = Buffer.concat([REAL_PNG.subarray(0, 8), Buffer.from('this is not a real picture, only its first bytes'), Buffer.alloc(200, 7)]);
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, store }) => {
    const res = await send(fake, 'id.png', 'image/png');
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'That picture could not be read. Choose a different photo.');
    assert.deepEqual(await store.list(), []);
  });
});

test('an enormous picture (a decompression bomb) is refused', async () => {
  // a PNG that says it is 30000 x 30000 pixels, in a few hundred bytes
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(30000, 0); header.writeUInt32BE(30000, 4); header[8] = 8; header[9] = 2;
  const bomb = Buffer.concat([REAL_PNG.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.alloc(100))), chunk('IEND', Buffer.alloc(0))]);
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, store }) => {
    const res = await send(bomb, 'bomb.png', 'image/png');
    assert.equal(res.status, 400);
    assert.deepEqual(await store.list(), []);
  });
});

test('the hard cap is 8 MB, with a clear message, and nothing is stored', async () => {
  assert.equal(MAX_UPLOAD_BYTES, 8 * MB);
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, store }) => {
    const res = await send(Buffer.concat([REAL_PNG, Buffer.alloc(8 * MB)]), 'huge.png', 'image/png');
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'The file must be 8 MB or smaller.');
    assert.deepEqual(await store.list(), []);
  });
});

test('a file between the old 5 MB limit and the new 8 MB cap is accepted and shrunk', async () => {
  const photo = await phonePhoto({ width: 4000, height: 3000, quality: 98, noise: 15 });
  assert.ok(photo.length > 5 * MB && photo.length < 8 * MB, `the test photo is ${(photo.length / MB).toFixed(1)} MB`);
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, read }) => {
    const res = await send(photo, 'big.jpg', 'image/jpeg');
    assert.equal(res.status, 200);
    const { bytes } = await read(res.body.saved);
    assert.ok(bytes.length < 0.5 * MB, `${(photo.length / MB).toFixed(1)} MB became ${(bytes.length / MB).toFixed(2)} MB`);
  });
});
