// Run with: npm test (inside server/). Technicians are told, once each and with a link to the job, when a
// customer's reschedule is approved or denied, when a booking is cancelled, and when the admin edits the
// instructions. A Pending booking is hidden from technicians, so nothing is sent for it. The real routes and the
// real auth middleware run in a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Closure = require('../models/Closure');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');
const { matches, chain } = require('./helpers/memoryQueries');

const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff' };
let DB;
let notes;
let failTechnicianNotes;
let server;
let base;

const booking = (over = {}) => {
  const b = {
    bookingId: 'CZ-1', customer: 'CUS1', service: { _id: 'S1', name: 'Cleaning', serviceType: 'Cleaning' }, status: 'Approved',
    date: '2026-10-20', time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], refund: {},
    paymentStatus: 'unpaid', downPaymentPercent: 0, technicianInstructions: 'Use the side gate', rescheduleRequest: { status: 'None' }, ...over,
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
  Closure.findOne = () => chain(null);
  Notification.create = async (d) => {
    if (failTechnicianNotes && accounts[d.user] === 'staff') throw new Error('notification store down');
    notes.push(d);
    return d;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); DB = []; notes = []; failTechnicianNotes = false; });

const call = async (method, path, as, body = {}) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const forTechnicians = () => notes.filter((n) => accounts[n.user] === 'staff');
const ofType = (type) => forTechnicians().filter((n) => n.type === type);
const usersOf = (list) => list.map((n) => n.user).sort();

// every technician notification carries a link to the job and is never repeated
const assertLinked = () => {
  forTechnicians().forEach((n) => assert.equal(n.relatedBookingId, 'CZ-1', 'a notification links to the job'));
  const keys = forTechnicians().map((n) => `${n.user}|${n.type}`);
  assert.equal(new Set(keys).size, keys.length, 'no technician gets the same kind of notification twice');
};

// ---- reschedule decisions
const withRequest = (over = {}) => booking({ rescheduleRequest: { status: 'Pending', requestedDate: '2026-10-27', requestedTime: 'Afternoon' }, ...over });

test('an approved reschedule tells the lead and the helper once, with the new schedule, and the customer as before', async () => {
  DB = [withRequest()];
  const res = await call('PATCH', '/api/bookings/CZ-1/reschedule/approve', 'ADM1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(usersOf(ofType('reschedule_approved')), ['T1', 'T2']);
  ofType('reschedule_approved').forEach((n) => assert.match(n.message, /2026-10-27, Afternoon/));
  assert.equal(notes.filter((n) => n.user === 'CUS1' && n.type === 'reschedule_approved').length, 1);
  assertLinked();
});

test('a denied reschedule tells the technicians the schedule stays', async () => {
  DB = [withRequest()];
  const res = await call('PATCH', '/api/bookings/CZ-1/reschedule/deny', 'ADM1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(usersOf(ofType('reschedule_denied')), ['T1', 'T2']);
  ofType('reschedule_denied').forEach((n) => assert.match(n.message, /2026-10-20, Morning/));
  assertLinked();
});

test('a reschedule of a booking that is still Pending tells no technician', async () => {
  DB = [withRequest({ status: 'Pending' })];
  await call('PATCH', '/api/bookings/CZ-1/reschedule/approve', 'ADM1');
  assert.deepEqual(forTechnicians(), []);
});

// ---- cancellations
['Approved'].forEach((status) => {
  test(`a customer cancelling an ${status} booking tells every technician once`, async () => {
    DB = [booking({ status })];
    const res = await call('PATCH', '/api/bookings/CZ-1/cancel', 'CUS1');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(usersOf(ofType('booking_cancelled')), ['T1', 'T2']);
    ofType('booking_cancelled').forEach((n) => assert.match(n.message, /was cancelled/));
    assertLinked();
  });
});

test('a customer cancelling a Pending booking tells no technician (they never saw it)', async () => {
  DB = [booking({ status: 'Pending' })];
  const res = await call('PATCH', '/api/bookings/CZ-1/cancel', 'CUS1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(forTechnicians(), []);
});

['Approved', 'In Progress'].forEach((status) => {
  test(`the admin cancelling an ${status} booking tells every technician once`, async () => {
    DB = [booking({ status })];
    const res = await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { status: 'Cancelled' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(usersOf(ofType('booking_cancelled')), ['T1', 'T2']);
    assertLinked();
  });
});

test('the admin cancelling a Pending booking tells no technician', async () => {
  DB = [booking({ status: 'Pending' })];
  await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { status: 'Cancelled' });
  assert.deepEqual(forTechnicians(), []);
});

// ---- edited instructions
['Approved', 'In Progress'].forEach((status) => {
  test(`editing the instructions of an ${status} booking tells the technicians once, without repeating the text`, async () => {
    DB = [booking({ status })];
    const res = await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { technicianInstructions: 'Use the back gate, code 4821' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(usersOf(ofType('instructions_updated')), ['T1', 'T2']);
    ofType('instructions_updated').forEach((n) => {
      assert.match(n.message, /instructions for booking CZ-1/);
      assert.equal(n.message.includes('4821'), false, 'the instruction text itself is not in the notification');
    });
    assertLinked();
  });
});

test('saving the same instructions again, or only adding spaces, tells nobody', async () => {
  DB = [booking()];
  await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { technicianInstructions: 'Use the side gate' });
  await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { technicianInstructions: '  Use the side gate  ' });
  assert.deepEqual(ofType('instructions_updated'), []);
});

test('instructions edited on a Pending, Completed or Cancelled booking tell nobody', async () => {
  for (const status of ['Pending', 'Completed', 'Cancelled']) {
    DB = [booking({ status })];
    notes = [];
    await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { technicianInstructions: 'New text' });
    assert.deepEqual(ofType('instructions_updated'), [], status);
  }
});

test('clearing the instructions counts as an edit', async () => {
  DB = [booking()];
  await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { technicianInstructions: '' });
  assert.deepEqual(usersOf(ofType('instructions_updated')), ['T1', 'T2']);
});

test('cancelling and editing in one request sends only the cancellation, once', async () => {
  DB = [booking()];
  await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { status: 'Cancelled', technicianInstructions: 'x' });
  assert.deepEqual(usersOf(ofType('booking_cancelled')), ['T1', 'T2']);
  assert.deepEqual(ofType('instructions_updated'), []);
});

test('the customer never hears about the technicians\' instruction edits', async () => {
  DB = [booking()];
  await call('PATCH', '/api/bookings/CZ-1/admin-update', 'ADM1', { technicianInstructions: 'Changed' });
  assert.equal(notes.some((n) => n.user === 'CUS1' && n.type === 'instructions_updated'), false);
});

// ---- failures
test('a notification that cannot be stored does not fail the change that was saved', async () => {
  failTechnicianNotes = true;
  DB = [withRequest()];
  const res = await call('PATCH', '/api/bookings/CZ-1/reschedule/approve', 'ADM1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(DB[0].date, '2026-10-27');
});

test('a technician on two pairs of a larger job is told once, not once per pair', async () => {
  DB = [withRequest({ assignments: [{ lead: 'T1', helper: 'T2' }, { lead: 'T1', helper: null }] })];
  await call('PATCH', '/api/bookings/CZ-1/reschedule/approve', 'ADM1');
  assert.equal(ofType('reschedule_approved').filter((n) => n.user === 'T1').length, 1);
});
