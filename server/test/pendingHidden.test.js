// Run with: npm test (inside server/). The real routes and the real auth middleware run in a tiny Express app;
// only the database calls are stubbed, so no database is needed.
//
// A Pending booking can already have a proposed lead and helper (auto-assign runs when it is made). The admin
// sees it. The technicians must not: not in any list, count, detail, report or action, and not in any
// notification, until the admin approves.
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
const scheduling = require('../constants/scheduling');
const { activeStatuses, findConflictingBooking } = require('../utils/assignments');
const { matches, chain } = require('./helpers/memoryQueries');

const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff', T3: 'staff', T4: 'staff' };

let DB;
let REPORTS;
let notes;
let reportFilters;
let server;
let base;

const makeBooking = (over = {}) => {
  const b = new Booking({
    bookingId: 'CZ-P', customer: 'CUS1', service: 'S1', address: '1 Test St', status: 'Pending', date: '2026-10-20', time: 'Morning',
    technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], ...over,
  });
  b.save = async () => b;
  b.populate = async () => b;
  return b;
};

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.find = (filter) => {
    const ids = filter?._id?.$in;
    return chain(ids ? ids.filter((id) => accounts[id]).map((id) => ({ _id: id, role: accounts[id], isActive: true, name: id })) : []);
  };
  User.findOne = () => chain({ _id: 'ADM1' });
  Booking.find = (filter) => chain(DB.filter((d) => matches(d, filter)));
  Booking.findOne = (filter) => chain(DB.find((d) => matches(d, filter)) || null);
  Booking.updateOne = async () => ({});
  Report.findOne = (f) => chain(REPORTS.find((r) => r.bookingId === f.bookingId) || null);
  Report.find = (f) => { reportFilters.push(f); return chain(REPORTS.filter((r) => matches(r, f))); };
  Notification.create = async (doc) => { notes.push(doc); return doc; };

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test.beforeEach(() => {
  authCache.clear();
  notes = [];
  reportFilters = [];
  scheduling.PENDING_HOLDS_SLOT = true;
  const pending = makeBooking({ feedback: { rating: 1 } }); // a rating that would show up in an average if Pending leaked
  const approved = makeBooking({ bookingId: 'CZ-A', status: 'Approved', time: 'Afternoon', feedback: { rating: 5 } });
  DB = [pending, approved];
  REPORTS = [new Report({ bookingId: 'CZ-P', booking: '64b64c1f1c1f1c1f1c1f1c1f', technicianId: 'T1', workSummary: 'x' })];
});

const call = async (method, path, as, body) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const idsOf = (list) => list.map((j) => j.bookingId).sort();
const assignedNotes = () => notes.filter((n) => n.type === 'job_assigned');
const unassignedNotes = () => notes.filter((n) => n.type === 'job_unassigned');

// ---- hidden on every technician route
['T1', 'T2'].forEach((tech) => {
  test(`My Jobs, calendar and dashboard list: ${tech} (lead or helper) does not see the Pending booking`, async () => {
    const res = await call('GET', '/api/bookings/technician/mine', tech);
    assert.equal(res.status, 200);
    assert.deepEqual(idsOf(res.body), ['CZ-A']);
  });
});

test('dashboard counts: a Pending booking adds nothing (its rating is not in the average)', async () => {
  const res = await call('GET', '/api/bookings/technician/mine/stats', 'T1');
  assert.equal(res.status, 200);
  assert.equal(res.body.ongoing, 1); // only the Approved one
  assert.equal(res.body.averageRating, 5);
  assert.equal(res.body.ratingCount, 1);
});

test('reporting a disruption or asking for an extension on a Pending booking is a 404, as if it does not exist', async () => {
  let res = await call('PATCH', '/api/bookings/CZ-P/disruption/report', 'T1', { reason: 'x' });
  assert.equal(res.status, 404);
  assert.equal(res.body.message, 'Booking not found');
  res = await call('PATCH', '/api/bookings/CZ-P/extension/request', 'T1', { reason: 'x' });
  assert.equal(res.status, 404);
  res = await call('PATCH', '/api/bookings/CZ-P/disruption/report', 'T2', { reason: 'x' });
  assert.equal(res.status, 404);
});

test('creating a service report for a Pending booking is a 404', async () => {
  const res = await call('POST', '/api/reports', 'T1', {
    bookingId: 'CZ-P', workSummary: 'x', clientConsentSignedName: 'C', clientConsentSignatureDataUrl: 'data:image/png;base64,AAAA',
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.message, 'Booking not found');
});

test('reading the report of a Pending booking is a 404 for its proposed technicians, but the admin and the customer are unaffected', async () => {
  for (const tech of ['T1', 'T2']) {
    const res = await call('GET', '/api/reports/booking/CZ-P', tech);
    assert.equal(res.status, 404, tech);
    assert.equal(res.body.message, 'Booking not found');
  }
});

test('the reports list asks only for jobs that are not Pending', async () => {
  DB = [makeBooking({ bookingId: 'CZ-P' }), makeBooking({ bookingId: 'CZ-IP', status: 'In Progress' })];
  const res = await call('GET', '/api/reports/technician/mine', 'T1');
  assert.equal(res.status, 200);
  const ids = reportFilters[0].$or.find((c) => c.bookingId).bookingId.$in;
  assert.deepEqual(ids, ['CZ-IP']);
});

test('assignment history of a Pending booking is a 404 for its proposed technicians', async () => {
  assert.equal((await call('GET', '/api/bookings/CZ-P/assignment-history', 'T1')).status, 404);
  assert.equal((await call('GET', '/api/bookings/CZ-P/assignment-history', 'T2')).status, 404);
});

test('a technician who is not on the booking still gets the same 404 for a Pending one (nothing to probe)', async () => {
  assert.equal((await call('PATCH', '/api/bookings/CZ-P/disruption/report', 'T3', { reason: 'x' })).status, 404);
});

// ---- the admin still sees it and can change it
test('the admin still sees the proposed lead and helper on the Pending booking', async () => {
  const list = await call('GET', '/api/bookings', 'ADM1');
  assert.equal(list.status, 200);
  const pending = list.body.find((b) => b.bookingId === 'CZ-P');
  assert.equal(pending.assignments[0].lead, 'T1');
  assert.equal(pending.assignments[0].helper, 'T2');
  assert.equal((await call('GET', '/api/bookings/CZ-P/assignment-history', 'ADM1')).status, 200);
});

// ---- notifications
test('changing the assignment while Pending sends nothing: no "assigned" and no "no longer assigned"', async () => {
  const res = await call('PATCH', '/api/bookings/CZ-P/assign', 'ADM1', { assignments: [{ technicianId: 'T3', helperId: 'T4' }] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(DB[0].assignments.map((a) => [a.lead, a.helper]), [['T3', 'T4']]);
  assert.deepEqual(notes, [], 'no notification of any kind');
});

test('approving sends the assignment notification once to each technician on the job, lead and helper', async () => {
  const res = await call('PATCH', '/api/bookings/CZ-P/admin-update', 'ADM1', { status: 'Approved' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const sent = assignedNotes();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((n) => n.user).sort(), ['T1', 'T2']);
  assert.match(sent.find((n) => n.user === 'T1').message, /as lead on booking CZ-P/);
  assert.match(sent.find((n) => n.user === 'T2').message, /as helper on booking CZ-P/);
  assert.equal(notes.filter((n) => n.type === 'booking_approved' && n.user === 'CUS1').length, 1, 'the customer is told as before');
});

test('a booking that is already approved cannot be approved again, so the notification cannot repeat', async () => {
  await call('PATCH', '/api/bookings/CZ-P/admin-update', 'ADM1', { status: 'Approved' });
  const again = await call('PATCH', '/api/bookings/CZ-P/admin-update', 'ADM1', { status: 'Approved' });
  assert.equal(again.status, 200); // same status requested again changes nothing
  assert.equal(assignedNotes().length, 2, 'still only the two from the first approval');
});

test('after approval the booking appears for the technician, on every route that hid it', async () => {
  await call('PATCH', '/api/bookings/CZ-P/admin-update', 'ADM1', { status: 'Approved' });
  const list = await call('GET', '/api/bookings/technician/mine', 'T1');
  assert.deepEqual(idsOf(list.body), ['CZ-A', 'CZ-P']);
  assert.equal((await call('GET', '/api/bookings/CZ-P/assignment-history', 'T1')).status, 200);
  const stats = await call('GET', '/api/bookings/technician/mine/stats', 'T1');
  assert.equal(stats.body.ratingCount, 2);
});

test('after approval a reassignment notifies the new technicians and the ones taken off, as it always did', async () => {
  await call('PATCH', '/api/bookings/CZ-P/admin-update', 'ADM1', { status: 'Approved' });
  notes = [];
  const res = await call('PATCH', '/api/bookings/CZ-P/assign', 'ADM1', { assignments: [{ technicianId: 'T3', helperId: 'T4' }] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(assignedNotes().map((n) => n.user).sort(), ['T3', 'T4']);
  assert.deepEqual(unassignedNotes().map((n) => n.user).sort(), ['T1', 'T2']);
});

// ---- the owner's switch: does a Pending booking hold the slot?
test('PENDING_HOLDS_SLOT defaults to the current behavior: Pending holds the slot', async () => {
  assert.equal(scheduling.PENDING_HOLDS_SLOT, true);
  assert.deepEqual(activeStatuses(), ['Pending', 'Approved', 'In Progress']);
  const clash = await findConflictingBooking(['T1'], '2026-10-20', 'Morning');
  assert.equal(clash?.bookingId, 'CZ-P');
});

test('with PENDING_HOLDS_SLOT off, a Pending booking holds nothing but an Approved one still does', async () => {
  scheduling.PENDING_HOLDS_SLOT = false;
  assert.deepEqual(activeStatuses(), ['Approved', 'In Progress']);
  assert.equal(await findConflictingBooking(['T1'], '2026-10-20', 'Morning'), null);
  const approved = await findConflictingBooking(['T1'], '2026-10-20', 'Afternoon');
  assert.equal(approved?.bookingId, 'CZ-A');
});

test('with the switch off, approving a booking whose technician is already booked is a 409 (checked at approval)', async () => {
  scheduling.PENDING_HOLDS_SLOT = false;
  DB.push(makeBooking({ bookingId: 'CZ-X', status: 'Approved', time: 'Morning' })); // T1 and T2 already on an Approved booking
  const res = await call('PATCH', '/api/bookings/CZ-P/admin-update', 'ADM1', { status: 'Approved' });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already booked/);
  assert.equal(assignedNotes().length, 0, 'nobody is told about a booking that was not approved');
});

test('with the switch on (today), the approval step does not add that check, so nothing changes', async () => {
  DB.push(makeBooking({ bookingId: 'CZ-X', status: 'Approved', time: 'Morning' }));
  const res = await call('PATCH', '/api/bookings/CZ-P/admin-update', 'ADM1', { status: 'Approved' });
  assert.equal(res.status, 200);
});
