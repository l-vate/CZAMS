// Run with: npm test (inside server/). The profile photo and the signed-form photo of a service report are written to the file store (in
// memory here) with their kinds, a refused or failed request leaves no file, and a spoofed type is refused before storing. The real routes
// and the real auth middleware run in a tiny Express app; only the database and the file store are replaced.
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
const { createMemoryStore, setStore } = require('../storage/fileStore');
const { chain } = require('./helpers/memoryQueries');
const { PNG_DATA_URL } = require('./helpers/signature');

const PNG = Buffer.from(PNG_DATA_URL.split(',')[1], 'base64');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const settle = () => new Promise((resolve) => { setTimeout(resolve, 40); });

let store;
let profile;
let savedReport;
let reportSaveFails;
let server;
let base;

test.before(async () => {
  User.findById = (id) => chain(id === 'T1' ? { _id: 'T1', role: 'staff', isActive: true, name: 'Tech' } : null);
  User.findOne = () => chain({ _id: 'T1', role: 'staff' });
  Report.findOne = () => chain(null);
  Report.prototype.save = async function save() {
    if (reportSaveFails) throw new Error('the database is down');
    savedReport = this;
    return this;
  };
  Notification.create = async (d) => d;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(() => {
  authCache.clear();
  store = createMemoryStore();
  setStore(store);
  savedReport = null;
  reportSaveFails = false;
  profile = { _id: 'T1', name: 'Tech', role: 'staff', save: async () => profile };
  User.findById = (id) => chain(id === 'T1' ? profile : null);
  const booking = new Booking({ bookingId: 'CZ-1', customer: 'CUS1', service: 'S1', address: 'x', status: 'In Progress', technician: 'T1', assignments: [{ lead: 'T1', helper: null }] });
  booking.save = async () => booking;
  Booking.findOne = () => chain(booking);
});

const token = () => jwt.sign({ id: 'T1', role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '5m' });
const upload = async (route, fields, field, bytes = PNG, type = 'image/png') => {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append(field, new Blob([bytes], { type }), 'private-name.png');
  const res = await fetch(`${base}${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const reportFields = { bookingId: 'CZ-1', workSummary: 'Done', issueResolution: 'Complete', laborHours: '1', followUpRequired: 'false' };
const photo = (bytes, type) => upload('/api/reports', reportFields, 'photo', bytes, type);

test('a profile photo is stored as a profile image and the user points at it', async () => {
  const res = await upload('/api/auth/profile/photo', {}, 'photo');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [file] = await store.list();
  assert.equal(file.metadata.kind, 'profile_image');
  assert.equal(file.metadata.uploadedBy, 'T1');
  assert.match(file.name, /^[0-9a-f]{32}\.png$/);
  assert.equal(profile.profileImage, `/uploads/profile-images/${file.name}`);
});

test('a profile photo that is not an image is refused and nothing is stored', async () => {
  assert.equal((await upload('/api/auth/profile/photo', {}, 'photo', HTML, 'image/png')).status, 400);
  assert.equal((await upload('/api/auth/profile/photo', {}, 'photo', Buffer.from('%PDF-1.4'), 'application/pdf')).status, 400);
  await settle();
  assert.equal((await store.list()).length, 0);
});

test('a profile photo for a user that cannot be saved removes the stored file', async () => {
  profile.save = async () => { throw new Error('the database is down'); };
  const res = await upload('/api/auth/profile/photo', {}, 'photo');
  assert.equal(res.status, 500);
  await settle();
  assert.equal((await store.list()).length, 0);
});

test('a report with a signed-form photo stores it as a signed form for that booking', async () => {
  const res = await photo();
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [file] = await store.list();
  assert.equal(file.metadata.kind, 'signed_form');
  assert.equal(file.metadata.uploadedBy, 'T1');
  assert.equal(file.metadata.bookingId, 'CZ-1');
  assert.equal(savedReport.signedFormPhoto, `/uploads/proofs/${file.name}`);
});

test('a report that cannot be saved removes its photo again', async () => {
  reportSaveFails = true;
  const res = await photo();
  assert.equal(res.status, 500);
  await settle();
  assert.equal((await store.list()).length, 0);
});

test('a report refused for its own rules, or with a spoofed photo, stores nothing', async () => {
  assert.equal((await upload('/api/reports', { ...reportFields, workSummary: '' }, 'photo')).status, 400);
  assert.equal((await photo(HTML, 'image/png')).status, 400);
  assert.equal((await photo(Buffer.from('RIFF....WEBP'), 'image/webp')).status, 400, 'the signed form photo is JPG or PNG only');
  await settle();
  assert.equal((await store.list()).length, 0);
  assert.equal(savedReport, null);
});
