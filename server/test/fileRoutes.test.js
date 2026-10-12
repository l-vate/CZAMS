// Run with: npm test (inside server/). The real file routes and the real auth middleware serve real files from
// a temporary folder. Only the database lookups are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const { authCache } = require('../utils/authCache');
const { createFileRouter } = require('../routes/fileRoutes');
const { mountUploads } = require('../config/uploadsStatic');
const { createLinkParts } = require('../utils/fileAccess');

const accounts = {
  ADM1: 'admin', CUS1: 'customer', CUS2: 'customer', T1: 'staff', T2: 'staff', T9: 'staff',
};

const P = (name) => `/uploads/proofs/${name}`;
// One booking: owner CUS1, lead T1, helper T2. Each kind of file hangs off it.
const booking = {
  bookingId: 'B1', customer: 'CUS1', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }],
  proofFile: P('down.png'), balanceProofFile: P('bal.png'), unitPurchaseProof: P('purchase.webp'),
  discount: { idFile: P('id.jpg') }, refund: { proofFile: P('refund.pdf') },
};
const reportRow = { bookingId: 'B1', signedFormPhoto: P('signed.png') };
// An old upload with a risky extension, referenced as a payment proof of the same booking.
booking.proofFile2 = P('old.html');

const FILES = {
  'down.png': 'png-bytes', 'bal.png': 'png-bytes', 'id.jpg': 'jpg-bytes', 'refund.pdf': '%PDF-1.4', 'purchase.webp': 'webp-bytes',
  'signed.png': 'png-bytes', 'orphan.png': 'png-bytes', 'old.html': '<script>alert(1)</script>',
};

const query = (value) => ({
  select() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

let root;
let server;
let base;

test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cza-files-test-'));
  fs.mkdirSync(path.join(root, 'proofs'));
  fs.mkdirSync(path.join(root, 'profile-images'));
  Object.entries(FILES).forEach(([name, body]) => fs.writeFileSync(path.join(root, 'proofs', name), body));
  fs.writeFileSync(path.join(root, 'profile-images', 'face.png'), 'face-bytes');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'outside the proofs folder');

  User.findById = (id) => query(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  Booking.find = (filter) => {
    if (filter.$or) {
      const wanted = filter.$or.map((c) => Object.values(c)[0]);
      const fields = [booking.proofFile, booking.balanceProofFile, booking.discount.idFile, booking.refund.proofFile, booking.unitPurchaseProof, booking.proofFile2];
      return query(fields.some((f) => wanted.includes(f)) ? [{ ...booking, proofFile: wanted.includes(booking.proofFile2) ? booking.proofFile2 : booking.proofFile }] : []);
    }
    return query(filter.bookingId && filter.bookingId.$in.includes('B1') ? [booking] : []);
  };
  Report.find = (filter) => query(filter.signedFormPhoto === reportRow.signedFormPhoto ? [reportRow] : []);

  const app = express();
  app.use(express.json());
  mountUploads(app, root);
  app.use('/api/files', createFileRouter({ proofsDir: path.join(root, 'proofs') }));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server && server.close();
  fs.rmSync(root, { recursive: true, force: true });
});
test.beforeEach(() => authCache.clear());

const bearer = (id) => ({ Authorization: `Bearer ${jwt.sign({ id, role: accounts[id] }, process.env.JWT_SECRET, { expiresIn: '5m' })}` });
const open = (name, id) => fetch(`${base}/api/files/proofs/${name}`, { headers: id ? bearer(id) : {} });
const makeLink = (name, id) => fetch(`${base}/api/files/proofs/${name}/link`, { method: 'POST', headers: id ? bearer(id) : {} });

// ---- every user against every kind of file, with a token
const ALL = { 'down.png': 'down payment proof', 'bal.png': 'balance proof', 'id.jpg': 'Senior/PWD ID', 'refund.pdf': 'refund proof', 'purchase.webp': 'purchase proof', 'signed.png': 'signed form photo' };
const EXPECT = {
  ADM1: { 'down.png': 200, 'bal.png': 200, 'id.jpg': 200, 'refund.pdf': 200, 'purchase.webp': 200, 'signed.png': 200, 'orphan.png': 200 },
  CUS1: { 'down.png': 200, 'bal.png': 200, 'id.jpg': 200, 'refund.pdf': 200, 'purchase.webp': 200, 'signed.png': 200, 'orphan.png': 404 },
  CUS2: { 'down.png': 404, 'bal.png': 404, 'id.jpg': 404, 'refund.pdf': 404, 'purchase.webp': 404, 'signed.png': 404, 'orphan.png': 404 },
  T1: { 'down.png': 404, 'bal.png': 404, 'id.jpg': 404, 'refund.pdf': 404, 'purchase.webp': 404, 'signed.png': 200, 'orphan.png': 404 },
  T2: { 'down.png': 404, 'bal.png': 404, 'id.jpg': 404, 'refund.pdf': 404, 'purchase.webp': 404, 'signed.png': 200, 'orphan.png': 404 },
  T9: { 'down.png': 404, 'bal.png': 404, 'id.jpg': 404, 'refund.pdf': 404, 'purchase.webp': 404, 'signed.png': 404, 'orphan.png': 404 },
};

Object.entries(EXPECT).forEach(([who, table]) => {
  Object.entries(table).forEach(([file, status]) => {
    test(`${who} opening ${file} with a token: ${status}`, async () => {
      const res = await open(file, who);
      assert.equal(res.status, status);
      if (status === 404) assert.equal(res.headers.get('content-type').includes('application/json'), true); // no file bytes
    });
    test(`${who} asking for a link to ${file}: ${status}`, async () => {
      assert.equal((await makeLink(file, who)).status, status);
    });
  });
});

test('every denial is a 404, never a 403, so a file name cannot be confirmed', async () => {
  for (const who of ['CUS2', 'T9']) {
    for (const file of Object.keys(ALL)) assert.equal((await open(file, who)).status, 404);
  }
  assert.equal((await open('does-not-exist.png', 'ADM1')).status, 404);
  assert.equal((await open('down.png')).status, 404, 'no credentials at all is also a 404');
});

// ---- how it is served
test('an image is served inline with its own type, nosniff and no caching', async () => {
  const res = await open('down.png', 'CUS1');
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('content-disposition'), /^inline;/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.equal(await res.text(), 'png-bytes');
});

test('a pdf is served inline as application/pdf', async () => {
  const res = await open('refund.pdf', 'CUS1');
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /^inline;/);
});

test('an old upload with another extension downloads as opaque bytes and is never rendered', async () => {
  const res = await open('old.html', 'ADM1');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/octet-stream');
  assert.match(res.headers.get('content-disposition'), /^attachment;/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

// ---- signed links
const viaLink = async (file, id) => {
  const made = await makeLink(file, id);
  assert.equal(made.status, 200);
  const { url, expiresInSeconds } = await made.json();
  assert.equal(expiresInSeconds, 300);
  return { url: `${base}${url}`, parts: Object.fromEntries(new URL(`${base}${url}`).searchParams) };
};

test('a link opens the file with no token at all, which is what an img tag does', async () => {
  const { url } = await viaLink('signed.png', 'CUS1');
  const res = await fetch(url); // no Authorization header
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(await res.text(), 'png-bytes');
});

test('a technician link to the signed form photo works; the same technician cannot get a link to a payment proof', async () => {
  const { url } = await viaLink('signed.png', 'T1');
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await makeLink('down.png', 'T1')).status, 404);
});

test('an expired link is a 404', async () => {
  const old = createLinkParts({ name: 'signed.png', userId: 'CUS1', now: Date.now() - 10 * 60 * 1000 });
  const q = new URLSearchParams({ u: old.u, exp: String(old.exp), sig: old.sig });
  assert.equal((await fetch(`${base}/api/files/proofs/signed.png?${q}`)).status, 404);
});

test('a link made for a different user is a 404', async () => {
  const { parts } = await viaLink('signed.png', 'CUS1');
  const q = new URLSearchParams({ ...parts, u: 'CUS2' });
  assert.equal((await fetch(`${base}/api/files/proofs/signed.png?${q}`)).status, 404);
});

test('a link made for a different file is a 404', async () => {
  const { parts } = await viaLink('signed.png', 'CUS1');
  const q = new URLSearchParams(parts);
  assert.equal((await fetch(`${base}/api/files/proofs/down.png?${q}`)).status, 404);
});

test('a link with a missing or altered signature is a 404', async () => {
  const { parts } = await viaLink('signed.png', 'CUS1');
  assert.equal((await fetch(`${base}/api/files/proofs/signed.png?u=${parts.u}&exp=${parts.exp}`)).status, 404);
  const q = new URLSearchParams({ ...parts, exp: String(Number(parts.exp) + 100000) });
  assert.equal((await fetch(`${base}/api/files/proofs/signed.png?${q}`)).status, 404);
});

test('asking for a link needs a login', async () => {
  assert.equal((await makeLink('signed.png')).status, 401);
});

// ---- path traversal
const ATTACKS = [
  '..%2Fsecret.txt', '..%2F..%2Fsecret.txt', '%2e%2e%2fsecret.txt', '%2E%2E%2Fsecret.txt', '%252e%252e%252fsecret.txt',
  '..%5Csecret.txt', '%2Fetc%2Fpasswd', 'C%3A%5CWindows%5Cwin.ini', '%2F..%2F..%2Fsecret.txt', '....%2F%2Fsecret.txt',
  'down.png%00.html', '.env', '..', '%2e%2e',
];

ATTACKS.forEach((attack) => {
  test(`path traversal attempt ${attack} is a 404 even for an admin, for the file and for the link`, async () => {
    const res = await open(attack, 'ADM1');
    assert.equal(res.status, 404);
    assert.equal((await res.text()).includes('outside the proofs folder'), false);
    assert.equal((await makeLink(attack, 'ADM1')).status, 404);
  });
});

test('a raw ../ in the address cannot reach the folder above either', async () => {
  const res = await fetch(`${base}/api/files/proofs/../secret.txt`, { headers: bearer('ADM1') });
  assert.notEqual(res.status, 200);
  assert.equal((await res.text()).includes('outside the proofs folder'), false);
});

// ---- /uploads
test('/uploads/proofs/<name> no longer returns the file, with or without a login', async () => {
  for (const name of Object.keys(FILES)) {
    assert.equal((await fetch(`${base}/uploads/proofs/${name}`)).status, 404, name);
    assert.equal((await fetch(`${base}/uploads/proofs/${name}`, { headers: bearer('ADM1') })).status, 404, name);
  }
});

test('profile photos are still public, with nosniff', async () => {
  const res = await fetch(`${base}/uploads/profile-images/face.png`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await res.text(), 'face-bytes');
});

test('nothing else under /uploads is served, and the proofs folder cannot be reached through the profile mount', async () => {
  assert.equal((await fetch(`${base}/uploads/secret.txt`)).status, 404);
  assert.equal((await fetch(`${base}/uploads/profile-images/..%2Fproofs%2Fdown.png`)).status, 404);
  assert.equal((await fetch(`${base}/uploads/profile-images/%2e%2e/proofs/down.png`)).status, 404);
});
