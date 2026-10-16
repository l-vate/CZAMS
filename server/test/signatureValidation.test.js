// Run with: npm test (inside server/). The drawn signature on a service report must be a real PNG or JPEG data URL
// under 500 KB; the typed name is still required with it. Anything else is a 400 and nothing is saved. The real route
// and the real auth middleware run in a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');
const { signatureProblem, SIGNATURE_MAX_BYTES } = require('../utils/reportEvidence');
const { chain } = require('./helpers/memoryQueries');
const { PNG_DATA_URL } = require('./helpers/signature');

const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString('base64')}`;
const url = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// ---- the rule on its own
test('a real PNG or JPEG data URL passes, and so does no signature at all (another rule decides if one is needed)', () => {
  assert.equal(signatureProblem(PNG_DATA_URL), null);
  assert.equal(signatureProblem(JPEG_DATA_URL), null);
  assert.equal(signatureProblem(undefined), null);
  assert.equal(signatureProblem(''), null);
});

test('everything else is refused', () => {
  const refused = [
    'data:image/png;base64,AAAA', // not a PNG inside
    url('image/png', [0xff, 0xd8, 0xff, 0xe0]), // a JPEG labelled PNG
    url('image/jpeg', PNG_HEAD), // a PNG labelled JPEG
    url('image/svg+xml', Buffer.from('<svg onload="x()"/>')),
    url('image/gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    url('image/webp', [0x52, 0x49, 0x46, 0x46]),
    url('text/html', Buffer.from('<script>alert(1)</script>')),
    'javascript:alert(1)',
    'https://example.com/sign.png',
    'data:image/png;base64,@@@not base64@@@',
    'data:image/png,rawtext',
    PNG_DATA_URL + '\n<script>',
    42, {}, [], true,
  ];
  refused.forEach((v) => {
    const p = signatureProblem(v);
    assert.ok(p, String(v).slice(0, 40));
    assert.equal(p.status, 400);
  });
});

test('the size limit is 500 KB: just under passes, just over is refused', () => {
  const body = (n) => [...PNG_HEAD, ...new Array(n - PNG_HEAD.length).fill(0)];
  assert.equal(signatureProblem(url('image/png', body(SIGNATURE_MAX_BYTES))), null);
  const over = signatureProblem(url('image/png', body(SIGNATURE_MAX_BYTES + 1)));
  assert.ok(over);
  assert.match(over.message, /500 KB/);
});

// ---- through the real route
const accounts = { T1: 'staff' };
let saved;
let server;
let base;

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: 'staff', isActive: true } : null);
  User.findOne = () => chain({ _id: 'T1', role: 'staff' });
  Report.findOne = () => chain(null);
  Report.prototype.save = async function save() { saved = this; return this; };
  Notification.create = async (d) => d;
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => {
  authCache.clear();
  saved = null;
  const booking = new Booking({ bookingId: 'CZ-1', customer: 'CUS1', service: 'S1', address: 'x', status: 'In Progress', technician: 'T1', assignments: [{ lead: 'T1', helper: null }] });
  booking.save = async () => booking;
  Booking.findOne = () => chain(booking);
});

const submit = async (over) => {
  const token = jwt.sign({ id: 'T1', role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const body = { bookingId: 'CZ-1', workSummary: 'Done', issueResolution: 'Complete', laborHours: 1, followUpRequired: false, clientConsentSignedName: 'Customer One', clientConsentSignatureDataUrl: PNG_DATA_URL, ...over };
  const res = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('a report with a real signature is saved', async () => {
  const res = await submit({});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(saved.clientConsent.signatureDataUrl, PNG_DATA_URL);
});

test('a report with a forged or oversized signature is a 400 and nothing is saved', async () => {
  for (const bad of ['data:image/png;base64,AAAA', url('image/svg+xml', Buffer.from('<svg/>')), 'https://example.com/x.png']) {
    const res = await submit({ clientConsentSignatureDataUrl: bad });
    assert.equal(res.status, 400, bad.slice(0, 40));
    assert.match(res.body.message, /signature is not a valid image/);
  }
  const big = url('image/png', [...PNG_HEAD, ...new Array(SIGNATURE_MAX_BYTES).fill(0)]);
  assert.equal((await submit({ clientConsentSignatureDataUrl: big })).status, 400);
  assert.equal(saved, null);
});

test('the typed name is still required with a drawn signature', async () => {
  const res = await submit({ clientConsentSignedName: '' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /signature and name/);
  assert.equal(saved, null);
});
