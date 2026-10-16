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
const { PNG_DATA_URL } = require('./helpers/signature');

const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

let stored; // the reports "in the database"
let deletedIds;
let booking;
let bookingSaves;
let failBookingSave;
let failNotification;
let server;
let base;

test.before(async () => {
  User.findById = (id) => query({ role: 'staff', isActive: true, _id: id });
  User.findOne = () => query({ _id: 'T1', role: 'staff' });
  Report.findOne = () => query(null);
  Report.findById = (id) => query(stored.find((r) => String(r._id) === String(id)) || null);
  Report.prototype.save = async function save() { stored.push(this); return this; };
  Report.deleteOne = async (filter) => {
    deletedIds.push(String(filter._id));
    stored = stored.filter((r) => String(r._id) !== String(filter._id));
    return { deletedCount: 1 };
  };
  Notification.create = async () => {
    if (failNotification) throw new Error('notification store down');
    return {};
  };

  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test.beforeEach(() => {
  authCache.clear();
  stored = [];
  deletedIds = [];
  bookingSaves = 0;
  failBookingSave = false;
  failNotification = false;
  booking = new Booking({
    bookingId: 'CZ-1', customer: 'CUS1', service: 'S1', address: '1 Test St', status: 'In Progress',
    technician: 'T1', assignments: [{ lead: 'T1', helper: null }],
  });
  booking.save = async () => {
    bookingSaves += 1;
    if (failBookingSave) throw new Error('booking update failed');
    return booking;
  };
  Booking.findOne = () => query(booking);
});

const submit = async () => {
  const token = jwt.sign({ id: 'T1', role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      bookingId: 'CZ-1', workSummary: 'Cleaned the unit', issueResolution: 'Complete', laborHours: 2, followUpRequired: false, clientConsentSignedName: 'Customer One',
      clientConsentSignatureDataUrl: PNG_DATA_URL,
    }),
  });
  return { status: res.status, body: await res.json() };
};

test('the normal case: one report, the booking Completed', async () => {
  const res = await submit();
  assert.equal(res.status, 201);
  assert.equal(stored.length, 1);
  assert.equal(booking.status, 'Completed');
  assert.equal(String(booking.reportId), String(stored[0]._id));
});

test('if the booking update fails, the report is rolled back so no report is left on a job that is not Completed', async () => {
  failBookingSave = true;
  const res = await submit();
  assert.equal(res.status, 500);
  assert.equal(stored.length, 0, 'the report must be removed');
  assert.equal(deletedIds.length, 1);
  assert.equal(booking.status, 'Completed'); // the in-memory copy was changed, but it was never saved
  assert.equal(bookingSaves, 1);
});

test('after a rollback the technician can submit again (no report is blocking it)', async () => {
  failBookingSave = true;
  assert.equal((await submit()).status, 500);
  failBookingSave = false;
  booking.status = 'In Progress';
  assert.equal((await submit()).status, 201);
  assert.equal(stored.length, 1);
});

test('a failing notification does not fail a report that was saved: the answer is still 201', async () => {
  failNotification = true;
  const res = await submit();
  assert.equal(res.status, 201);
  assert.equal(stored.length, 1);
  assert.equal(deletedIds.length, 0, 'nothing is rolled back for a notification problem');
});
