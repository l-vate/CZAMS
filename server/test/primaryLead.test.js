// Run with: npm test (inside server/). On a job with several pairs only the primary lead (the lead of the first
// pair) files the service report. Other leads and helpers are refused with a clear message, and the technician's own
// job list says who the primary lead is. The real routes and the real auth middleware run in a tiny Express app;
// only the database calls are stubbed, so no database is needed.
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
const { getPrimaryLeadId } = require('../utils/assignments');
const { matches, chain } = require('./helpers/memoryQueries');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = require('../utils/extensionDays');

const accounts = { ADM1: 'admin', T1: 'staff', T2: 'staff', T3: 'staff', T4: 'staff' };
let booking;
let DB;
let saved;
let server;
let base;

const makeBooking = (assignments) => {
  const b = {
    bookingId: 'CZ-1', customer: 'CUS1', service: { _id: 'S1', name: 'Cleaning', serviceType: 'Cleaning' }, status: 'In Progress',
    date: addDays(manilaTodayKey(), 0), time: 'Morning', technician: assignments[0].lead, assignments, refund: {},
    paymentStatus: 'unpaid', downPaymentPercent: 0, extensionDays: [],
  };
  b.save = async () => b;
  b.populate = async () => b;
  b.toObject = () => b;
  return b;
};
const TWO_PAIRS = [{ lead: 'T1', helper: 'T2' }, { lead: 'T3', helper: 'T4' }];

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true, position: 'Technician' } : null);
  User.findOne = (f) => chain({ _id: f && f._id, role: 'staff' });
  User.find = () => chain([]);
  Report.findOne = () => chain(null);
  Report.prototype.save = async function save() { saved = this; return this; };
  Notification.create = async (d) => d;
  Booking.findOne = () => chain(booking);
  Booking.find = (f) => chain(DB.filter((d) => matches(d, f)));

  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); saved = null; booking = makeBooking(TWO_PAIRS); DB = [booking]; });

const call = async (as, method, path, body) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const REPORT = {
  bookingId: 'CZ-1', workSummary: 'Cleaned both units', issueResolution: 'Complete', laborHours: 2, followUpRequired: false,
  clientConsentSignedName: 'Customer One', clientConsentSignatureDataUrl: 'data:image/png;base64,AAAA',
};
const file = (as) => call(as, 'POST', '/api/reports', REPORT);

test('the primary lead is the lead of the first pair, and is null with nobody assigned', () => {
  assert.equal(getPrimaryLeadId(booking), 'T1');
  assert.equal(getPrimaryLeadId({ assignments: [{ lead: 'T3', helper: null }, { lead: 'T1', helper: null }] }), 'T3');
  assert.equal(getPrimaryLeadId({ technician: 'T9', assignments: [] }), 'T9', 'an old booking with only a technician');
  assert.equal(getPrimaryLeadId({ assignments: [] }), null);
});

test('on a two-pair job the primary lead can file the report', async () => {
  const res = await file('T1');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(saved.technicianId, 'T1');
});

test('the lead of the second pair is refused with a clear message and nothing is saved', async () => {
  const res = await file('T3');
  assert.equal(res.status, 403);
  assert.match(res.body.message, /primary lead/);
  assert.equal(saved, null);
  assert.equal(booking.status, 'In Progress');
});

test('a helper in either pair is refused', async () => {
  for (const helper of ['T2', 'T4']) {
    const res = await file(helper);
    assert.equal(res.status, 403, helper);
    assert.match(res.body.message, /lead technician/);
  }
  assert.equal(saved, null);
});

test('a technician who is not on the job is refused', async () => {
  accounts.T9 = 'staff';
  const res = await file('T9');
  assert.equal(res.status, 403);
  assert.equal(saved, null);
  delete accounts.T9;
});

test('a single pair job is unchanged: its lead is the primary lead', async () => {
  booking = makeBooking([{ lead: 'T1', helper: 'T2' }]);
  assert.equal((await file('T1')).status, 201);
});

test('when the first pair is replaced, the new primary lead can file and the old one cannot', async () => {
  booking = makeBooking([{ lead: 'T3', helper: 'T4' }, { lead: 'T1', helper: 'T2' }]);
  assert.equal(getPrimaryLeadId(booking), 'T3');
  assert.equal((await file('T1')).status, 403, 'the former primary lead');
  assert.equal(saved, null);
  assert.equal((await file('T3')).status, 201);
});

test('the technician job list marks who is the primary lead', async () => {
  const mine = async (as) => (await call(as, 'GET', '/api/bookings/technician/mine')).body[0];
  const a = await mine('T1');
  assert.equal(a.myRole, 'Lead');
  assert.equal(a.isPrimaryLead, true);
  const b = await mine('T3');
  assert.equal(b.myRole, 'Lead');
  assert.equal(b.isPrimaryLead, false);
  const c = await mine('T2');
  assert.equal(c.myRole, 'Helper');
  assert.equal(c.isPrimaryLead, false);
});

// ---- the admin saves several pairs; the first one is the primary lead
test('the admin can save two pairs, a repeated technician is refused, and the first pair becomes primary', async () => {
  const realFind = User.find;
  const realFindOne = Booking.findOne;
  const realUpdateOne = Booking.updateOne;
  Booking.updateOne = async () => ({ acknowledged: true });
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  User.find = (f) => chain((((f && f._id && f._id.$in) || []).map((id) => ({ _id: id, position: 'Technician' }))));
  try {
    booking = makeBooking([{ lead: 'T1', helper: null }]);
    booking.status = 'Pending';
    DB = [booking];
    const dup = await call('ADM1', 'PATCH', '/api/bookings/CZ-1/assign', { assignments: [{ technicianId: 'T1', helperId: 'T2' }, { technicianId: 'T2' }] });
    assert.equal(dup.status, 400);
    const ok = await call('ADM1', 'PATCH', '/api/bookings/CZ-1/assign', { assignments: [{ technicianId: 'T3', helperId: 'T4' }, { technicianId: 'T1', helperId: 'T2' }] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(booking.assignments.length, 2);
    assert.equal(getPrimaryLeadId(booking), 'T3');
    assert.equal(booking.technician, 'T3');
  } finally {
    User.find = realFind;
    Booking.findOne = realFindOne;
    Booking.updateOne = realUpdateOne;
  }
});
