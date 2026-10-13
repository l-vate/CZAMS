// Run with: npm test (inside server/). The real auth middleware and the real report-creating route run in a
// tiny Express app; only the database calls are stubbed, so no database is needed.
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

const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

let saved;
let booking;
let server;
let base;

test.before(async () => {
  User.findById = (id) => query({ role: 'staff', isActive: true, _id: id });
  User.findOne = () => query({ _id: 'T1', role: 'staff' });
  Report.findOne = () => query(null);
  Report.prototype.save = async function save() { saved = this; return this; };
  Notification.create = async () => ({});

  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test.beforeEach(() => {
  authCache.clear();
  saved = null;
  booking = new Booking({
    bookingId: 'CZ-1', customer: 'CUS1', service: 'S1', address: '1 Test St', status: 'In Progress',
    technician: 'T1', assignments: [{ lead: 'T1', helper: null }],
  });
  booking.save = async () => booking;
  Booking.findOne = () => query(booking);
});

const submit = async (body) => {
  const token = jwt.sign({ id: 'T1', role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      bookingId: 'CZ-1', workSummary: 'Cleaned the unit', issueResolution: 'Complete', laborHours: 2, followUpRequired: false, clientConsentSignedName: 'Customer One',
      clientConsentSignatureDataUrl: 'data:image/png;base64,AAAA', ...body,
    }),
  });
  return { status: res.status, body: await res.json() };
};

test('a submittedAt sent by the client is ignored: the server sets the time itself', async () => {
  const before = Date.now();
  const res = await submit({ submittedAt: '2020-01-01T00:00:00.000Z' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(saved, 'the report was saved');
  const stamp = new Date(saved.submittedAt).getTime();
  assert.ok(stamp >= before && stamp <= Date.now(), `submittedAt ${saved.submittedAt} is not the server time`);
});

test('without a submittedAt the time is still set by the server', async () => {
  const before = Date.now();
  await submit({});
  assert.ok(new Date(saved.submittedAt).getTime() >= before);
});

test('a future submittedAt from the client is ignored too', async () => {
  await submit({ submittedAt: '2099-12-31T00:00:00.000Z' });
  assert.ok(new Date(saved.submittedAt).getTime() < Date.now() + 60000);
});
