// Run with: npm test (inside server/). Who counts as a field technician, and that every list, picker, count and
// calendar uses the same rule: secretaries and cashiers (also role "staff") never do. The real routes and the real
// auth middleware run in a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Closure = require('../models/Closure');
const Team = require('../models/Team');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');
const { FIELD_POSITIONS, hasFieldPosition, isFieldTechnician } = require('../utils/technicians');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays, isSunday } = require('../utils/extensionDays');
const { matches, chain } = require('./helpers/memoryQueries');

// ---- the rule
const staff = (position, over = {}) => ({ role: 'staff', isActive: true, position, ...over });

test('the field positions are Technician, Lead Technician and Helper', () => {
  assert.deepEqual([...FIELD_POSITIONS], ['Technician', 'Lead Technician', 'Helper']);
});

test('a mixed staff list: technicians qualify, office staff and the inactive do not', () => {
  const list = [
    ['Technician', true], ['technician', true], ['  Lead Technician ', true], ['HELPER', true], ['Helper', true],
    ['', true], [undefined, true], [null, true], // an account made before positions existed
    ['Cashier', false], ['Secretary', false], ['Office Staff', false], ['Senior Aircon Tech', false], ['Technician Trainer', false],
  ];
  list.forEach(([position, expected]) => assert.equal(isFieldTechnician(staff(position)), expected, JSON.stringify(position)));
  assert.equal(isFieldTechnician(staff('Technician', { isActive: false })), false);
  assert.equal(isFieldTechnician({ role: 'admin', isActive: true, position: 'Technician' }), false);
  assert.equal(isFieldTechnician({ role: 'customer', isActive: true }), false);
  assert.equal(isFieldTechnician(null), false);
  assert.equal(hasFieldPosition('Cashier'), false);
});

test('the browser applies the same rule as the server, on the same list', async () => {
  const client = await import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'technicians.js')).href);
  const people = [staff('Technician'), staff('Lead Technician'), staff('Helper'), staff(''), staff(undefined), staff('Cashier'), staff('Secretary'), staff('Other'),
    staff('Technician', { isActive: false }), { role: 'admin', isActive: true }, { role: 'customer', isActive: true }];
  people.forEach((p) => assert.equal(client.isFieldTechnician(p), isFieldTechnician(p), JSON.stringify(p)));
  assert.deepEqual([...client.FIELD_POSITIONS], [...FIELD_POSITIONS]);
});

test('the admin figures use it too (dashboard count and the technician report data)', () => {
  const root = path.join(__dirname, '..', '..', 'src');
  assert.match(fs.readFileSync(path.join(root, 'pages', 'admin', 'dashboard.jsx'), 'utf8'), /isFieldTechnician/);
  assert.match(fs.readFileSync(path.join(root, 'services', 'analyticsService.js'), 'utf8'), /isFieldTechnician/);
});

// ---- the places that list or pick technicians
const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff', T3: 'staff', T4: 'staff', T5: 'staff', T6: 'staff', T7: 'staff' };
// T1 Technician, T2 Helper, T3 Lead Technician, T4 Cashier, T5 Secretary, T6 no position, T7 inactive technician
const STAFF = [
  { _id: 'T1', name: 'Tech One', position: 'Technician', isActive: true },
  { _id: 'T2', name: 'Tech Two', position: 'Helper', isActive: true },
  { _id: 'T3', name: 'Tech Three', position: 'Lead Technician', isActive: true },
  { _id: 'T4', name: 'Office Cashier', position: 'Cashier', isActive: true },
  { _id: 'T5', name: 'Office Secretary', position: 'Secretary', isActive: true },
  { _id: 'T6', name: 'Old Tech', isActive: true },
  { _id: 'T7', name: 'Gone Tech', position: 'Technician', isActive: false },
];
const FIELD = ['T1', 'T2', 'T3', 'T6'];

let DB;
let server;
let base;

test.before(async () => {
  require('./helpers/stubLocks').installLockStub(); // an assignment now takes a short lock per technician (utils/slotLock.js)
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  // what the database does for the queries the code makes: staff only, active only, and by id when asked
  User.find = (filter = {}) => chain(STAFF.filter((u) => (!filter.isActive || u.isActive === true) && (!filter._id || filter._id.$in.includes(u._id))));
  User.findOne = () => chain({ _id: 'ADM1' });
  Booking.find = (f) => chain(DB.filter((d) => matches(d, f)));
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  Booking.updateOne = async () => ({});
  Closure.find = () => chain([]);
  Closure.findOne = () => chain(null);
  Notification.create = async (d) => d;
  Team.find = () => { throw new Error('the old Team records must not be read'); };

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  app.use('/api/teams', require('../routes/teamRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); DB = []; });

const call = async (method, p, as, body = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (as) headers.Authorization = `Bearer ${jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' })}`;
  const res = await fetch(`${base}${p}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const idsOf = (list) => list.map((u) => u._id).sort();

test('the public technician list and the booking form list leave out office staff', async () => {
  const visitor = await call('GET', '/api/auth/technicians');
  assert.deepEqual(visitor.body.map((u) => u.name).sort(), ['Old Tech', 'Tech One', 'Tech Three', 'Tech Two']);
  const signedIn = await call('GET', '/api/auth/technicians', 'CUS1');
  assert.deepEqual(idsOf(signedIn.body), FIELD);
});

test('the admin picker (free and busy technicians) leaves out office staff', async () => {
  const res = await call('GET', '/api/teams/availability?date=2026-10-20&time=Morning', 'ADM1');
  assert.equal(res.status, 200);
  assert.deepEqual(idsOf(res.body.technicians), FIELD);
});

test('the admin workload table leaves out office staff', async () => {
  const res = await call('GET', '/api/bookings/technician-workload', 'ADM1');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((r) => r.technicianId).sort(), FIELD);
});

test('an office staff account cannot be put on a job; a technician can', async () => {
  const pending = () => {
    const b = { bookingId: 'CZ-1', customer: 'CUS1', service: { name: 'Cleaning', serviceType: 'Cleaning' }, status: 'Pending', date: '2026-10-20', time: 'Morning', assignments: [], refund: {} };
    b.save = async () => b;
    b.populate = async () => b;
    b.toObject = () => b;
    return b;
  };
  DB = [pending()];
  const cashier = await call('PATCH', '/api/bookings/CZ-1/assign', 'ADM1', { assignments: [{ technicianId: 'T1', helperId: 'T4' }] });
  assert.equal(cashier.status, 400);
  assert.equal(cashier.body.message, 'That technician is not available.');
  const secretary = await call('PATCH', '/api/bookings/CZ-1/assign', 'ADM1', { assignments: [{ technicianId: 'T5' }] });
  assert.equal(secretary.status, 400);
  DB = [pending()];
  const ok = await call('PATCH', '/api/bookings/CZ-1/assign', 'ADM1', { assignments: [{ technicianId: 'T1', helperId: 'T2' }] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('auto-assign never picks office staff, even when they are the only ones free', async () => {
  const { proposeAssignment } = require('../utils/autoAssign');
  let day = addDays(manilaTodayKey(), 10);
  while (isSunday(day)) day = addDays(day, 1);
  // every field technician is busy that morning; only the cashier and the secretary are free
  DB = [{ bookingId: 'X', status: 'Approved', date: day, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }, { lead: 'T3', helper: 'T6' }], extensionDays: [] }];
  const none = await proposeAssignment({ bookingId: 'NEW', date: day, time: 'Morning', service: { serviceType: 'Cleaning' }, status: 'Pending' });
  assert.equal(none.assignment, null, 'two office staff are not a pair of technicians');
  // with one field technician free, a Cleaning still needs a second, who cannot be office staff
  DB = [{ bookingId: 'X', status: 'Approved', date: day, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }, { lead: 'T3', helper: null }], extensionDays: [] }];
  const one = await proposeAssignment({ bookingId: 'NEW', date: day, time: 'Morning', service: { serviceType: 'Cleaning' }, status: 'Pending' });
  assert.equal(one.assignment, null, 'one free technician plus office staff is still not a pair');
  // with a free pair of technicians, the proposal uses only them
  DB = [];
  const pair = await proposeAssignment({ bookingId: 'NEW', date: day, time: 'Morning', service: { serviceType: 'Cleaning' }, status: 'Pending' });
  const chosen = [pair.assignment.technicianId, pair.assignment.helperId];
  chosen.forEach((id) => assert.ok(FIELD.includes(id), `${id} is not a field technician`));
});

test('public availability counts free pairs of field technicians only, and never reads the old Team records', async () => {
  const { getAvailability } = require('../utils/availability');
  let day = addDays(manilaTodayKey(), 10);
  while (isSunday(day)) day = addDays(day, 1);
  // 4 field technicians in all: 2 pairs. One pair is busy that morning, so one pair is free, and the cashier and
  // the secretary make no difference.
  DB = [{ bookingId: 'X', status: 'Approved', date: day, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], extensionDays: [] }];
  let [row] = await getAvailability(day, day);
  assert.equal(row.morning, true, 'one pair of technicians is still free');
  // now the other pair is busy too: office staff must not fill the gap
  DB.push({ bookingId: 'Y', status: 'Approved', date: day, time: 'Morning', technician: 'T3', assignments: [{ lead: 'T3', helper: 'T6' }], extensionDays: [] });
  [row] = await getAvailability(day, day);
  assert.equal(row.morning, false, 'the cashier and the secretary are not a free pair');
  assert.equal(row.afternoon, true);
});

test('the old Team model stays registered, because old bookings still carry a team id to show', () => {
  require('../utils/assignments');
  assert.ok(mongoose.models.Team, 'the Team model is registered');
  assert.ok(require('../utils/assignments').ASSIGNMENT_POPULATE.some((p) => p.path === 'assignments.team'));
});
