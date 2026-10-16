// Run with: npm test (inside server/). Tests the size math and skip rules of the photo shrinker, which has no
// browser-only imports. The canvas part needs a browser (NOT TESTED here); its fallbacks are checked below.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'photoShrink.js')).href);
const MB = 1024 * 1024;

test('the longest side is brought down to 2000 px and the shape is kept', async () => {
  const { scaleToFit } = await load();
  assert.deepEqual(scaleToFit(4000, 3000), { width: 2000, height: 1500, resized: true });
  assert.deepEqual(scaleToFit(3000, 4000), { width: 1500, height: 2000, resized: true }); // portrait
  assert.deepEqual(scaleToFit(4032, 3024), { width: 2000, height: 1500, resized: true });
  assert.deepEqual(scaleToFit(12000, 100), { width: 2000, height: 17, resized: true });
});

test('a photo that is already small is never enlarged', async () => {
  const { scaleToFit } = await load();
  assert.deepEqual(scaleToFit(2000, 1500), { width: 2000, height: 1500, resized: false });
  assert.deepEqual(scaleToFit(800, 600), { width: 800, height: 600, resized: false });
  assert.deepEqual(scaleToFit(1, 1), { width: 1, height: 1, resized: false });
});

test('a very thin image never rounds to a zero side', async () => {
  const { scaleToFit } = await load();
  const r = scaleToFit(100000, 1);
  assert.equal(r.width, 2000);
  assert.ok(r.height >= 1);
});

test('a PNG under 1 MB is left alone; a PNG of 1 MB or more is shrunk', async () => {
  const { shouldTryShrink } = await load();
  assert.equal(shouldTryShrink({ type: 'image/png', size: 900 * 1024 }), false);
  assert.equal(shouldTryShrink({ type: 'image/png', size: MB - 1 }), false);
  assert.equal(shouldTryShrink({ type: 'image/png', size: MB }), true);
  assert.equal(shouldTryShrink({ type: 'image/png', size: 4 * MB }), true);
});

test('JPEG and WEBP photos are shrunk whatever their size; the result is kept only if smaller', async () => {
  const { shouldTryShrink, keepShrunk } = await load();
  assert.equal(shouldTryShrink({ type: 'image/jpeg', size: 8 * MB }), true);
  assert.equal(shouldTryShrink({ type: 'image/jpeg', size: 200 * 1024 }), true);
  assert.equal(shouldTryShrink({ type: 'image/webp', size: 3 * MB }), true);
  assert.equal(keepShrunk(6 * MB, 700 * 1024), true);
  assert.equal(keepShrunk(300 * 1024, 320 * 1024), false); // re-encoding made it bigger: keep the original
  assert.equal(keepShrunk(300 * 1024, 300 * 1024), false);
  assert.equal(keepShrunk(300 * 1024, 0), false);
});

test('PDFs and anything that is not a JPEG, PNG or WEBP image are never touched', async () => {
  const { shouldTryShrink } = await load();
  ['application/pdf', 'image/svg+xml', 'image/gif', 'image/heic', 'text/html', '', undefined].forEach((type) => {
    assert.equal(shouldTryShrink({ type, size: 9 * MB }), false, String(type));
  });
});

test('the new file is named .jpg', async () => {
  const { jpegName } = await load();
  assert.equal(jpegName('IMG_0042.JPG'), 'IMG_0042.jpg');
  assert.equal(jpegName('screenshot.png'), 'screenshot.jpg');
  assert.equal(jpegName('photo.final.webp'), 'photo.final.jpg');
  assert.equal(jpegName('noextension'), 'noextension.jpg');
  assert.equal(jpegName(''), 'photo.jpg');
  assert.equal(jpegName(undefined), 'photo.jpg');
});

test('the constants are the agreed ones', async () => {
  const { MAX_SIDE, JPEG_QUALITY, PNG_KEEP_BYTES } = await load();
  assert.equal(MAX_SIDE, 2000);
  assert.equal(JPEG_QUALITY, 0.8);
  assert.equal(PNG_KEEP_BYTES, MB);
});

test('with no browser (no createImageBitmap or document), the original file comes back unchanged', async () => {
  const { shrinkPhoto } = await load();
  const original = { name: 'big.jpg', type: 'image/jpeg', size: 8 * MB };
  assert.equal(await shrinkPhoto(original), original);
});

test('a file the rules skip comes back as the same object, with no decoding attempted', async () => {
  const { shrinkPhoto } = await load();
  const pdf = { name: 'a.pdf', type: 'application/pdf', size: 3 * MB };
  const smallPng = { name: 's.png', type: 'image/png', size: 200 * 1024 };
  assert.equal(await shrinkPhoto(pdf), pdf);
  assert.equal(await shrinkPhoto(smallPng), smallPng);
  assert.equal(await shrinkPhoto(null), null);
});

test('if decoding fails, the original file is sent', async () => {
  const { shrinkPhoto } = await load();
  global.document = { createElement: () => { throw new Error('no canvas'); } };
  global.createImageBitmap = async () => { throw new Error('cannot decode'); };
  try {
    const original = { name: 'broken.jpg', type: 'image/jpeg', size: 8 * MB };
    assert.equal(await shrinkPhoto(original), original);
  } finally {
    delete global.document;
    delete global.createImageBitmap;
  }
});
