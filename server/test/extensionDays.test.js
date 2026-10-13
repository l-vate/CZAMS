// Run with: npm test (inside server/). An approved extension records the extra day on the booking and holds every
// technician on the job for that date and time block. The real routes and the real auth middleware run in a tiny
// Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Closure = require('../models/Closure');
const Team = require('../models/Team');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { slotsOf, nextWorkingDayKey, extensionSlotProblem, addDays, isSunday } = require('../utils/extensionDays');
const { findConflictingBooking, getBusyTechnicianIds } = require('../utils/assignments');
const { toTechnicianView } = require('../utils/technicianView');
const { matches, chain } = require('./helpers/memoryQueries');

// ---- pure rules
test('a booking occupies its own date and block and each approved extra day', () => {
  assert.deepEqual(slotsOf({ date: '2026-10-20', time: 'Morning', extensionDays: [{ date: '2026-10-21', time: 'Morning' }, { date: '2026-10-21', time: 'Afternoon' }] }), [
    { date: '2026-10-20', time: 'Morning' }, { date: '2026-10-21', time: 'Morning' }, { date: '2026-10-21', time: 'Afternoon' },
  ]);
  assert.deepEqual(slotsOf({ date: '2026-10-20', time: 'Morning' }), [{ date: '2026-10-20', time: 'Morning' }]);
  assert.deepEqual(slotsOf(null), []);
});

test('the default extra day is the next working day: not a Sunday, not a closed date', () => {
  assert.equal(nextWorkingDayKey('2026-10-19'), '2026-10-20'); // Monday to Tuesday
  assert.equal(nextWorkingDayKey('2026-10-24'), '2026-10-26'); // Saturday skips Sunday to Monday
  assert.equal(nextWorkingDayKey('2026-10-19', new Set(['2026-10-20'])), '2026-10-21');
  assert.equal(nextWorkingDayKey('2026-10-24', new Set(['2026-10-26'])), '2026-10-27');
  assert.equal(isSunday('2026-10-25'), true);
});

test('an extra day is refused when it is not a real day, a real block, a Sunday, in the past, the job\'s own block, or already approved', () => {
  const booking = { date: '2026-10-20', time: 'Morning', extensionDays: [{ date: '2026-10-22', time: 'Morning' }] };
  const today = '2026-10-20';
  assert.equal(extensionSlotProblem({ date: '2026-10-21', time: 'Morning' }, booking, today), null);
  assert.equal(extensionSlotProblem({ date: '2026-10-20', time: 'Afternoon' }, booking, today), null); // the afternoon of the same day
  assert.match(extensionSlotProblem({ date: '2026-02-31', time: 'Morning' }, booking, today), /valid date/);
  assert.match(extensionSlotProblem({ date: '2026-10-21', time: 'Evening' }, booking, today), /Morning or Afternoon/);
  assert.match(extensionSlotProblem({ date: '2026-10-25', time: 'Morning' }, booking, today), /Sundays/);
  assert.match(extensionSlotProblem({ date: '2026-10-19', time: 'Morning' }, booking, today), /before the job or in the past/);
  assert.match(extensionSlotProblem({ date: '2026-10-20', time: 'Morning' }, booking, today), /already has/);
  assert.match(extensionSlotProblem({ date: '2026-10-22', time: 'Morning' }, booking, today), /already approved/);
});

// ---- the technician view
test('the technician sees the extra day asked for and each approved one, without the admin id', () => {
  const view = toTechnicianView({
    bookingId: 'CZ-1',
    extensionRequest: { status: 'Approved', reason: 'more time', requestedDate: '2026-10-21', requestedTime: 'Morning', decidedBy: 'ADM1' },
    extensionDays: [{ date: '2026-10-21', time: 'Morning', approvedBy: 'ADM1', approvedAt: '2026-10-20T00:00:00Z' }],
  });
  assert.equal(view.extensionRequest.requestedDate, '2026-10-21');
  assert.deepEqual(view.extensionDays, [{ date: '2026-10-21', time: 'Morning' }]);
  assert.equal(JSON.stringify(view).includes('ADM1'), false);
});

// ---- the conflict rule, with an in-memory stand-in for the database
const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff', T3: 'staff', T4: 'staff', T5: 'staff' };
const TODAY = manilaTodayKey();

let DB;
let CLOSED;
let notes;
let server;
let base;

const job = (over = {}) => {
  const b = {
    bookingId: 'CZ-1', customer: 'CUS1', service: { _id: 'S1', name: 'Cleaning', serviceType: 'Cleaning' }, status: 'In Progress',
    date: TODAY, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], extensionDays: [], refund: {},
    extensionRequest: { status: 'None' }, ...over,
  };
  b.save = async () => b;
  b.populate = async () => b;
  b.toObject = () => b;
  return b;
};

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.find = (filter) => {
    const ids = filter?._id?.$in;
    if (ids) return chain(ids.filter((id) => accounts[id] === 'staff').map((id) => ({ _id: id })));
    return chain(Object.keys(accounts).filter((id) => accounts[id] === 'staff').map((id) => ({ _id: id, name: id })));
  };
  User.findOne = () => chain({ _id: 'ADM1' });
  Booking.find = (f) => chain(DB.filter((d) => matches(d, f)));
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  Booking.updateOne = async () => ({});
  Closure.findOne = (f) => chain(CLOSED.includes(f.date) ? { date: f.date, reason: 'Holiday' } : null);
  Closure.find = () => chain(CLOSED.map((date) => ({ date })));
  Team.find = () => chain([]);
  Notification.create = async (d) => { notes.push(d); return d; };

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); DB = []; CLOSED = []; notes = []; });

const call = async (method, path, as, body = {}) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: method === 'GET' ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const tomorrow = nextWorkingDayKey(TODAY);
const sameDayNotes = (type) => notes.filter((n) => n.type === type);

// ---- requesting
test('the lead\'s request records the extra day; with no date given it is the next working day in the job\'s block', async () => {
  DB = [job()];
  const res = await call('PATCH', '/api/bookings/CZ-1/extension/request', 'T1', { reason: 'Needs more time' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(DB[0].extensionRequest.status, 'Pending');
  assert.equal(DB[0].extensionRequest.requestedDate, tomorrow);
  assert.equal(DB[0].extensionRequest.requestedTime, 'Morning');
  assert.equal(res.body.extensionRequest.requestedDate, tomorrow, 'the technician view carries it');
  assert.match(sameDayNotes('extension_requested')[0].message, new RegExp(tomorrow));
});

test('the default skips a closed shop date', async () => {
  CLOSED = [tomorrow];
  DB = [job()];
  await call('PATCH', '/api/bookings/CZ-1/extension/request', 'T1', { reason: 'Needs more time' });
  assert.equal(DB[0].extensionRequest.requestedDate, nextWorkingDayKey(TODAY, new Set(CLOSED)));
});

test('the lead can choose the day and block; a Sunday, a closed date, the past and the job\'s own block are refused', async () => {
  DB = [job()];
  const later = nextWorkingDayKey(addDays(tomorrow, 1)); // never a Sunday, whatever day the test runs
  const ok = await call('PATCH', '/api/bookings/CZ-1/extension/request', 'T1', { reason: 'x', date: later, time: 'Afternoon' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(DB[0].extensionRequest.requestedTime, 'Afternoon');

  const refused = async (body, pattern) => {
    DB = [job()];
    const res = await call('PATCH', '/api/bookings/CZ-1/extension/request', 'T1', { reason: 'x', ...body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.message, pattern);
    assert.equal(DB[0].extensionRequest.status, 'None');
  };
  let sunday = tomorrow;
  while (!isSunday(sunday)) sunday = addDays(sunday, 1);
  await refused({ date: sunday }, /Sundays/);
  let past = addDays(TODAY, -2);
  while (isSunday(past)) past = addDays(past, -1); // a past Sunday would be refused as a Sunday first
  await refused({ date: past }, /before the job or in the past/);
  await refused({ date: TODAY, time: 'Morning' }, /already has/);
  await refused({ date: 'not-a-date' }, /valid date/);
  CLOSED = [later];
  await refused({ date: later }, /closed/i);
});

test('only the lead can ask, and only while the job is In Progress, and only once at a time', async () => {
  DB = [job()];
  assert.equal((await call('PATCH', '/api/bookings/CZ-1/extension/request', 'T2', { reason: 'x' })).status, 403);
  DB = [job({ status: 'Approved' })];
  assert.equal((await call('PATCH', '/api/bookings/CZ-1/extension/request', 'T1', { reason: 'x' })).status, 400);
  DB = [job({ extensionRequest: { status: 'Pending' } })];
  assert.equal((await call('PATCH', '/api/bookings/CZ-1/extension/request', 'T1', { reason: 'x' })).status, 400);
});

// ---- approving with no conflict
const pendingExtension = (over = {}) => job({ extensionRequest: { status: 'Pending', reason: 'more time', requestedDate: tomorrow, requestedTime: 'Morning' }, ...over });

test('approving with no conflict records the day, tells every technician and the customer the date, and holds the technicians', async () => {
  DB = [pendingExtension()];
  const res = await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(DB[0].extensionRequest.status, 'Approved');
  assert.equal(DB[0].extensionDays.length, 1);
  assert.equal(DB[0].extensionDays[0].date, tomorrow);
  assert.equal(DB[0].extensionDays[0].time, 'Morning');
  assert.equal(DB[0].extensionDays[0].approvedBy, 'ADM1');
  assert.ok(DB[0].extensionDays[0].approvedAt);

  const approved = sameDayNotes('extension_approved');
  assert.deepEqual(approved.filter((n) => n.user !== 'CUS1').map((n) => n.user).sort(), ['T1', 'T2'], 'lead and helper');
  approved.forEach((n) => assert.match(n.message, new RegExp(tomorrow)));
  assert.match(approved.find((n) => n.user === 'CUS1').message, new RegExp(`${tomorrow} \\(Morning\\)`));
});

test('after approval both technicians are busy on that date and block, for the conflict rule and for the busy list', async () => {
  DB = [pendingExtension()];
  await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1');
  assert.equal((await findConflictingBooking(['T1'], tomorrow, 'Morning'))?.bookingId, 'CZ-1');
  assert.equal((await findConflictingBooking(['T2'], tomorrow, 'Morning'))?.bookingId, 'CZ-1');
  assert.equal(await findConflictingBooking(['T1'], tomorrow, 'Afternoon'), null, 'the other block is free');
  assert.equal(await findConflictingBooking(['T3'], tomorrow, 'Morning'), null, 'someone else is free');
  assert.equal(await findConflictingBooking(['T1'], tomorrow, 'Morning', 'CZ-1'), null, 'the booking itself is ignored when reassigning it');
  assert.deepEqual((await getBusyTechnicianIds(tomorrow, 'Morning')).sort(), ['T1', 'T2']);
  assert.deepEqual(await getBusyTechnicianIds(tomorrow, 'Afternoon'), []);
  const busy = await call('GET', `/api/bookings/busy-technicians?date=${tomorrow}&time=Morning`, 'ADM1');
  assert.deepEqual(busy.body.busyTechIds.sort(), ['T1', 'T2']);
});

test('after approval, booking the same technicians on that date is refused; other blocks and other technicians are fine', async () => {
  DB = [pendingExtension()];
  await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1');
  const other = job({ bookingId: 'CZ-2', status: 'Pending', date: tomorrow, time: 'Morning', technician: undefined, assignments: [] });
  DB.push(other);
  const clash = await call('PATCH', '/api/bookings/CZ-2/assign', 'ADM1', { assignments: [{ technicianId: 'T1', helperId: 'T3' }] });
  assert.equal(clash.status, 409, JSON.stringify(clash.body));
  assert.match(clash.body.message, /already booked/);
  assert.match(clash.body.message, /CZ-1/);
  const free = await call('PATCH', '/api/bookings/CZ-2/assign', 'ADM1', { assignments: [{ technicianId: 'T3', helperId: 'T4' }] });
  assert.equal(free.status, 200, JSON.stringify(free.body));
});

test('an extra day that is not Approved or In Progress any more no longer holds anyone', async () => {
  DB = [pendingExtension()];
  await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1');
  DB[0].status = 'Completed';
  assert.equal(await findConflictingBooking(['T1'], tomorrow, 'Morning'), null);
  DB[0].status = 'Cancelled';
  assert.equal(await findConflictingBooking(['T1'], tomorrow, 'Morning'), null);
});

// ---- approving with a conflict
test('approving with a conflict is a 409 that names the clash; nothing is recorded and the request stays Pending', async () => {
  DB = [
    pendingExtension(),
    job({ bookingId: 'CZ-9', status: 'Approved', date: tomorrow, time: 'Morning', technician: 'T2', assignments: [{ lead: 'T2', helper: 'T5' }] }),
  ];
  const res = await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1');
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already booked/);
  assert.deepEqual(res.body.conflict, { bookingId: 'CZ-9', date: tomorrow, time: 'Morning' });
  assert.equal(DB[0].extensionDays.length, 0);
  assert.equal(DB[0].extensionRequest.status, 'Pending');
  assert.equal(sameDayNotes('extension_approved').length, 0, 'nobody is told it was approved');
});

test('a conflict with another booking\'s own extra day is also caught', async () => {
  DB = [
    pendingExtension(),
    job({ bookingId: 'CZ-8', status: 'In Progress', date: TODAY, time: 'Afternoon', technician: 'T2', assignments: [{ lead: 'T2', helper: 'T5' }], extensionDays: [{ date: tomorrow, time: 'Morning' }] }),
  ];
  const res = await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1');
  assert.equal(res.status, 409);
  assert.equal(res.body.conflict.bookingId, 'CZ-8');
});

test('the admin can pick another date after a conflict, and that one is approved', async () => {
  DB = [
    pendingExtension(),
    job({ bookingId: 'CZ-9', status: 'Approved', date: tomorrow, time: 'Morning', technician: 'T2', assignments: [{ lead: 'T2', helper: 'T5' }] }),
  ];
  const day = nextWorkingDayKey(tomorrow);
  const res = await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1', { date: day, time: 'Morning' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(DB[0].extensionDays[0].date, day);
  assert.equal(DB[0].extensionRequest.requestedDate, day);
});

test('only an admin can approve, and a finished booking cannot be extended', async () => {
  DB = [pendingExtension()];
  assert.equal((await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'T1')).status, 403);
  DB = [pendingExtension({ status: 'Completed' })];
  assert.equal((await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1')).status, 400);
});

// ---- denying
test('denying records nothing and holds nobody; the same technicians can then be booked on that date', async () => {
  DB = [pendingExtension()];
  const res = await call('PATCH', '/api/bookings/CZ-1/extension/deny', 'ADM1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(DB[0].extensionRequest.status, 'Denied');
  assert.equal(DB[0].extensionDays.length, 0);
  assert.equal(await findConflictingBooking(['T1'], tomorrow, 'Morning'), null);
  assert.equal(sameDayNotes('extension_denied').length, 3, 'lead, helper and customer are told');

  DB.push(job({ bookingId: 'CZ-2', status: 'Pending', date: tomorrow, time: 'Morning', technician: undefined, assignments: [] }));
  const book = await call('PATCH', '/api/bookings/CZ-2/assign', 'ADM1', { assignments: [{ technicianId: 'T1', helperId: 'T2' }] });
  assert.equal(book.status, 200, JSON.stringify(book.body));
});

test('after a denial the lead can ask again, and a second day can be approved on top of the first', async () => {
  DB = [job({ extensionRequest: { status: 'Denied' } })];
  assert.equal((await call('PATCH', '/api/bookings/CZ-1/extension/request', 'T1', { reason: 'again' })).status, 200);
  await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1');
  DB[0].extensionRequest = { status: 'Pending', requestedDate: nextWorkingDayKey(addDays(tomorrow, 2)), requestedTime: 'Morning' };
  const second = await call('PATCH', '/api/bookings/CZ-1/extension/approve', 'ADM1');
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(DB[0].extensionDays.length, 2);
});

// ---- the other places that decide who is busy
test('the public availability calendar counts a technician pair as busy on an approved extra day', async () => {
  const { getAvailability } = require('../utils/availability');
  let day = addDays(TODAY, 10);
  while (isSunday(day)) day = addDays(day, 1);
  // two technicians in all, both on a job whose extra day is `day`, Morning
  const only = ['T1', 'T2'];
  const previous = User.find;
  User.find = () => chain(only.map((id) => ({ _id: id })));
  try {
    DB = [job({ status: 'Approved', date: addDays(day, -1), time: 'Morning', extensionDays: [{ date: day, time: 'Morning' }] })];
    const [row] = await getAvailability(day, day);
    assert.equal(row.morning, false, 'the morning of the extra day is full');
    assert.equal(row.afternoon, true, 'the afternoon is still open');
  } finally {
    User.find = previous;
  }
});

test('auto-assign does not propose a technician who is on an approved extra day in that block', async () => {
  const { proposeAssignment } = require('../utils/autoAssign');
  let day = addDays(TODAY, 10);
  while (isSunday(day)) day = addDays(day, 1);
  DB = [job({ bookingId: 'CZ-7', status: 'Approved', date: addDays(day, -1), time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], extensionDays: [{ date: day, time: 'Morning' }] })];
  const target = { bookingId: 'CZ-NEW', date: day, time: 'Morning', service: { serviceType: 'Cleaning' }, status: 'Pending' };
  const proposal = await proposeAssignment(target);
  assert.ok(proposal.assignment, proposal.reason);
  const chosen = [proposal.assignment.technicianId, proposal.assignment.helperId];
  assert.equal(chosen.includes('T1') || chosen.includes('T2'), false, `proposed ${chosen.join(' and ')}, who are busy that morning`);
});
