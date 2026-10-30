// Run with: npm test (inside server/). The admin can reschedule a disrupted job straight away, without waiting for a
// report from the lead (a reason is then required), and the customer and every technician on the job are told once.
// The path where the lead reported first still works. The real route and the real auth middleware run in a tiny
// Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Closure = require('../models/Closure');
const TechnicianOff = require('../models/TechnicianOff');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');
const { matches, chain } = require('./helpers/memoryQueries');

const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff' };
let DB;
let notes;
let closedDate;
let server;
let base;

const booking = (over = {}) => {
  const b = {
    bookingId: 'CZ-1', customer: 'CUS1', service: { _id: 'S1', name: 'Cleaning', serviceType: 'Cleaning' }, status: 'In Progress',
    date: '2026-10-20', time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], refund: {},
    paymentStatus: 'unpaid', downPaymentPercent: 0, rescheduleRequest: { status: 'None' }, extensionDays: [], ...over,
  };
  b.save = async () => b;
  b.populate = async () => b;
  b.toObject = () => b;
  return b;
};

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.find = () => chain([]);
  User.findOne = () => chain({ _id: 'ADM1' });
  Booking.find = (f) => chain(DB.filter((d) => matches(d, f)));
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  Closure.findOne = (f) => chain(closedDate && f && JSON.stringify(f).includes(closedDate) ? { date: closedDate, reason: 'Holiday' } : null);
  TechnicianOff.find = () => chain([]);
  Notification.create = async (d) => { notes.push(d); return d; };

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); DB = []; notes = []; closedDate = null; });

const move = async (as, body, id = 'CZ-1') => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/bookings/${id}/disruption/reschedule`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const { bookableDay } = require('./helpers/bookableDay');
const NEW = { date: bookableDay(4), time: 'Afternoon' }; // a day the booking rules accept whatever day the tests run (not a Sunday, 3 days to 5 months ahead)
const sent = () => notes.filter((n) => n.type === 'Disruption Rescheduled' || /rescheduled/i.test(n.message || ''));

test('the admin can reschedule an In Progress job with no report, giving the reason', async () => {
  const b = booking();
  DB = [b];
  const res = await move('ADM1', { ...NEW, reason: 'Storm flooded the street' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.date, NEW.date);
  assert.equal(b.time, NEW.time);
  assert.equal(b.status, 'Approved');
  assert.equal(b.disruption.status, 'Rescheduled');
  assert.equal(b.disruption.reason, 'Storm flooded the street');
  assert.equal(b.disruption.initiatedBy, 'admin');
  assert.equal(b.disruption.reportedBy, 'ADM1');
});

test('an Approved job can be moved too', async () => {
  DB = [booking({ status: 'Approved' })];
  assert.equal((await move('ADM1', { ...NEW, reason: 'Technician van broke down' })).status, 200);
});

test('without a reason the admin path is refused and nothing changes', async () => {
  const b = booking();
  DB = [b];
  for (const reason of [undefined, '', '   ']) {
    const res = await move('ADM1', { ...NEW, reason });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /reason is required/);
  }
  assert.equal(b.date, '2026-10-20');
  assert.equal(b.disruption, undefined);
  assert.equal(notes.length, 0);
});

test('a job that is not Approved or In Progress cannot be started this way', async () => {
  for (const status of ['Pending', 'Completed', 'Cancelled', 'Declined']) {
    DB = [booking({ status })];
    const res = await move('ADM1', { ...NEW, reason: 'x' });
    assert.equal(res.status, 400, status);
  }
  assert.equal(notes.length, 0);
});

test('a closed date is refused', async () => {
  closedDate = NEW.date;
  const b = booking();
  DB = [b];
  const res = await move('ADM1', { ...NEW, reason: 'Storm' });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.message, /shop is closed/);
  assert.equal(b.date, '2026-10-20');
  assert.equal(notes.length, 0);
});

test('a technician already booked at the new time gives a 409 and nothing changes', async () => {
  const b = booking();
  DB = [b, booking({ bookingId: 'CZ-2', date: NEW.date, time: NEW.time, assignments: [{ lead: 'T2', helper: null }], technician: 'T2' })];
  const res = await move('ADM1', { ...NEW, reason: 'Storm' });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /CZ-2/);
  assert.equal(b.date, '2026-10-20');
  assert.equal(notes.length, 0);
});

test('only an admin can do it', async () => {
  for (const as of ['T1', 'CUS1']) {
    DB = [booking()];
    assert.equal((await move(as, { ...NEW, reason: 'x' })).status, 403, as);
  }
});

test('the customer and both technicians are told once each, on the admin path', async () => {
  DB = [booking()];
  assert.equal((await move('ADM1', { ...NEW, reason: 'Storm' })).status, 200);
  const users = notes.map((n) => n.user).sort();
  assert.deepEqual(users, ['CUS1', 'T1', 'T2']);
  notes.forEach((n) => assert.equal(n.relatedBookingId, 'CZ-1'));
  assert.ok(sent().length >= 3);
});

test('the report path still works with no reason from the admin, and tells the same people once', async () => {
  const b = booking({ disruption: { status: 'Reported', reason: 'Wet ceiling', reportedBy: 'T1' } });
  DB = [b];
  const res = await move('ADM1', NEW);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.disruption.status, 'Rescheduled');
  assert.equal(b.disruption.reason, 'Wet ceiling', 'the lead\'s reason is kept');
  assert.equal(b.disruption.initiatedBy, 'technician');
  assert.deepEqual(notes.map((n) => n.user).sort(), ['CUS1', 'T1', 'T2']);
});

test('extra days approved for the old schedule are released when the job moves', async () => {
  const b = booking({ extensionDays: [{ date: '2026-10-21', time: 'Morning' }], extensionRequest: { status: 'Pending' } });
  DB = [b];
  assert.equal((await move('ADM1', { ...NEW, reason: 'Storm' })).status, 200);
  assert.deepEqual(b.extensionDays, []);
  assert.equal(b.extensionRequest.status, 'Denied');
});
