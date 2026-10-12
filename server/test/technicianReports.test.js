// Run with: npm test (inside server/). The real auth middleware and the real reports route run in a tiny
// Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const { authCache } = require('../utils/authCache');

const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

const OBJECT_ID = '64b64c1f1c1f1c1f1c1f1c1f';
const report = (bookingId, technicianId) => new Report({
  bookingId, booking: OBJECT_ID, technicianId, workSummary: `work on ${bookingId}`,
});

// T1 leads CZ-1, is the helper on CZ-2 (T2 leads it) and is the legacy single technician on CZ-3.
const jobs = [
  { bookingId: 'CZ-1', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }] },
  { bookingId: 'CZ-2', technician: 'T2', assignments: [{ lead: 'T2', helper: 'T1' }] },
  { bookingId: 'CZ-3', technician: 'T1', assignments: [] },
];

let reportFilter;
let reportCalls;
let userCalls;
let server;
let base;

test.before(async () => {
  User.findById = (id) => query({ role: 'staff', isActive: true, _id: id });
  User.find = (filter) => {
    userCalls += 1;
    return query([{ _id: 'T1', name: 'Tech One', email: 'one@example.com' }].filter((u) => filter._id.$in.includes(u._id)));
  };
  Booking.find = () => query(jobs.filter((j) => j.technician === 'T1' || j.assignments.some((a) => a.lead === 'T1' || a.helper === 'T1')));
  Report.find = (filter) => {
    reportCalls += 1;
    reportFilter = filter;
    return query([report('CZ-1', 'T1'), report('CZ-3', 'T1')]);
  };

  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); reportCalls = 0; userCalls = 0; reportFilter = null; });

const mine = async (id = 'T1') => {
  const token = jwt.sign({ id, role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/reports/technician/mine`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
};

test('all of a technician\'s reports come back in one request, with one report query and one author lookup', async () => {
  const res = await mine();
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(reportCalls, 1);
  assert.equal(userCalls, 1, 'the author is looked up once, not once per report');
});

test('only jobs the technician LEADS are asked for: not the job where they are the helper', async () => {
  await mine();
  const ids = reportFilter.$or.find((c) => c.bookingId).bookingId.$in;
  assert.deepEqual([...ids].sort(), ['CZ-1', 'CZ-3']); // CZ-3 is a job made before assignments existed
  assert.equal(ids.includes('CZ-2'), false);
  assert.ok(reportFilter.$or.some((c) => c.technicianId === 'T1')); // and anything they filed themselves
});

test('the author is shown by name only, never by email', async () => {
  const res = await mine();
  assert.equal(res.body[0].technician.name, 'Tech One');
  assert.equal(JSON.stringify(res.body).includes('one@example.com'), false);
  assert.equal(res.body[0].workSummary, 'work on CZ-1');
});
