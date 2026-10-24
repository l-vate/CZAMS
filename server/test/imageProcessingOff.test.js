// Run with: npm test (inside server/). If the image library (sharp) cannot be loaded on the host, the server does not crash: processing is
// "off", it says so once at startup and once per upload, GET /api/health reports imageProcessing "off", and a picture is stored as it came
// (checked by its first bytes, held to the 8 MB cap). The failure is simulated by loading the library with a loader that throws.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const imageProcessing = require('../utils/imageProcessing');
const { createUploader, storeUploads, IMAGE_TYPES, PROOF_TYPES } = require('../utils/uploadSafety');
const healthRoutes = require('../routes/healthRoutes');
const { createMemoryStore, setStore, KINDS } = require('../storage/fileStore');
const { REAL_PNG, REAL_JPG, REAL_PDF } = require('./helpers/images');

const { initImageProcessing, imageProcessingStatus, warnIfImageProcessingOff, OFF_WARNING } = imageProcessing;
const MB = 1024 * 1024;

const failToLoad = () => initImageProcessing(() => { throw new Error('Could not load the "sharp" module using the win32-x64 runtime\nstack line that must not be kept'); });
const restore = () => initImageProcessing();

test.afterEach(() => restore());

test('a library that cannot be loaded turns processing off, with a short reason and no crash', () => {
  assert.equal(imageProcessingStatus(), 'on', 'it loads normally here');
  assert.equal(failToLoad(), 'off');
  assert.equal(imageProcessingStatus(), 'off');
  const problem = imageProcessing.imageProcessingProblem();
  assert.match(problem, /^Error: Could not load the "sharp" module/);
  assert.equal(problem.includes('stack line'), false, 'only the first line of the reason is kept');
  assert.equal(restore(), 'on');
  assert.equal(imageProcessing.imageProcessingProblem(), null);
});

test('a library that loads but breaks while being set up is also "off", not a crash', () => {
  const broken = { cache() { throw new Error('native module mismatch'); }, concurrency() {} };
  assert.equal(initImageProcessing(() => broken), 'off');
});

test('the startup message is one warning when processing is off, and nothing when it is on', () => {
  const lines = [];
  assert.equal(warnIfImageProcessingOff((line) => lines.push(line)), false);
  assert.deepEqual(lines, []);
  failToLoad();
  assert.equal(warnIfImageProcessingOff((line) => lines.push(line)), true);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(OFF_WARNING));
  assert.match(lines[0], /sharp/);
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /imageProcessing'\)\.warnIfImageProcessingOff\(\)/, 'the server runs it at startup');
});

test('GET /api/health says imageProcessing "off", and nothing about why, the host or the environment', async () => {
  const app = express();
  app.use('/api/health', healthRoutes);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  try {
    healthRoutes.healthLimiter.reset();
    assert.equal((await (await fetch(url)).json()).imageProcessing, 'on');
    failToLoad();
    const res = await fetch(url);
    assert.equal(res.status, 200, 'the server is still up');
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['imageProcessing', 'status', 'time']);
    assert.equal(body.imageProcessing, 'off');
    assert.equal(body.status, 'ok');
    const text = JSON.stringify(body).toLowerCase();
    ['sharp', 'win32', 'module', 'error', 'path'].forEach((word) => assert.equal(text.includes(word), false, word));
    restore();
    assert.equal((await (await fetch(url)).json()).imageProcessing, 'on', 'and it comes back when the library loads again');
  } finally {
    server.close();
  }
});

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
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await run({ send, warnings, read: async (name) => { const f = await store.open(name); const chunks = []; for await (const c of f.stream) chunks.push(c); return Buffer.concat(chunks); }, store });
  } finally {
    console.warn = realWarn;
    server.close();
    setStore(null);
  }
}

test('with processing off a picture is stored exactly as it came, under its own type, and each upload warns once', async () => {
  failToLoad();
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, warnings, read }) => {
    const first = await send(REAL_PNG, 'proof.png', 'image/png');
    assert.equal(first.status, 200);
    assert.match(first.body.saved, /^[0-9a-f]{32}\.png$/, 'still a png: it was not re-encoded');
    assert.equal(first.body.type, 'image/png');
    assert.equal((await read(first.body.saved)).equals(REAL_PNG), true, 'not a byte changed');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0], OFF_WARNING);
    const second = await send(REAL_JPG, 'other.jpg', 'image/jpeg');
    assert.equal(second.status, 200);
    assert.match(second.body.saved, /\.jpg$/);
    assert.equal(warnings.length, 2, 'one warning for each upload');
  });
});

test('with processing off a PDF is stored as it came and says nothing, and a picture is still checked by its first bytes', async () => {
  failToLoad();
  await withApp({ allowedTypes: PROOF_TYPES }, async ({ send, warnings, store }) => {
    assert.equal((await send(REAL_PDF, 'receipt.pdf', 'application/pdf')).status, 200);
    assert.equal(warnings.length, 0, 'a PDF is never processed, so there is nothing to warn about');
    for (const [bytes, name, type] of [[Buffer.from('<html><script>alert(1)</script></html>'), 'photo.png', 'image/png'], [Buffer.from('plain text'), 'photo.jpg', 'image/jpeg'], [REAL_JPG, 'photo.png', 'image/png']]) {
      const res = await send(bytes, name, type);
      assert.equal(res.status, 400, `${name} with ${type}`);
    }
    assert.equal((await store.list()).length, 1, 'only the PDF was stored');
  });
});

test('with processing off the 8 MB cap still applies, with the same message', async () => {
  failToLoad();
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, store }) => {
    const small = await send(Buffer.concat([REAL_PNG, Buffer.alloc(7 * MB)]), 'big.png', 'image/png');
    assert.equal(small.status, 200, 'under 8 MB is accepted unprocessed');
    const huge = await send(Buffer.concat([REAL_PNG, Buffer.alloc(8 * MB)]), 'huge.png', 'image/png');
    assert.equal(huge.status, 400);
    assert.equal(huge.body.message, 'The file must be 8 MB or smaller.');
    assert.equal((await store.list()).length, 1);
  });
});

test('with processing back on, pictures are cleaned again', async () => {
  failToLoad();
  restore();
  await withApp({ allowedTypes: IMAGE_TYPES }, async ({ send, warnings }) => {
    const res = await send(REAL_PNG, 'proof.png', 'image/png');
    assert.equal(res.status, 200);
    assert.match(res.body.saved, /\.jpg$/);
    assert.equal(warnings.length, 0);
  });
});

test('in a fresh process where the sharp module cannot be found, requiring the upload code works and the status is "off"', () => {
  const { execFileSync } = require('node:child_process');
  const script = [
    "const Module = require('module'); const load = Module._load;",
    "Module._load = function (request, ...rest) { if (request === 'sharp') throw new Error('Cannot find module sharp'); return load.call(this, request, ...rest); };",
    "const ip = require('./utils/imageProcessing'); require('./utils/uploadSafety'); require('./routes/healthRoutes');",
    "console.log(ip.imageProcessingStatus());",
  ].join(' ');
  const out = execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.equal(out.trim(), 'off');
});
