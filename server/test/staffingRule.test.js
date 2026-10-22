// Run with: npm test (inside server/). The staffing rule from the paper: a pair (lead and helper) for everything
// except a check-up or survey, enforced when a booking is approved and when assignments change. The real routes
// and the real auth middleware run in a tiny Express app; only the database calls are stubbed.
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
const { getMinTechnicians, isStaffed, staffingProblem } = require('../utils/assignments');
const { matches, chain } = require('./helpers/memoryQueries');

const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff', T3: 'staff', T4: 'staff' };
const TYPES = ['Cleaning', 'Installation', 'Repair', 'Maintenance', 'Leak Repair', 'Check-up', 'Other'];
const PAIR_TYPES = TYPES.filter((t) => t !== 'Check-up' && t !== 'Other'); // Other defaults to a pair too

let DB;
let server;
let base;

// A plain booking object (a real Mongoose document would refuse a populated service object).
const booking = (service, status, assignments, over = {}) => {
  const b = {
    bookingId: 'CZ-1', customer: 'CUS1', service, status, date: '2026-10-20', time: 'Morning', refund: {},
    technician: assignments[0]?.lead, assignments, ...over,
  };
  b.save = async () => b;
  b.populate = async () => b;
  b.toObject = () => b;
  return b;
};
const svc = (serviceType, extra = {}) => ({ _id: 'S1', name: serviceType, serviceType, ...extra });

test.before(async () => {
  require('./helpers/stubLocks').installLockStub(); // an assignment now takes a short lock per technician (utils/slotLock.js)
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.find = (filter) => {
    const ids = filter?._id?.$in;
    return chain(ids ? ids.filter((id) => accounts[id] === 'staff').map((id) => ({ _id: id })) : []);
  };
  User.findOne = () => chain({ _id: 'ADM1' });
  Closure.find = () => chain([]); // the suggested dates look at closure days
  TechnicianOff.find = () => chain([]);
  Booking.find = (f) => chain(DB.filter((d) => matches(d, f)));
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  Booking.updateOne = async () => ({});
  Notification.create = async (d) => d;

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); DB = []; });

const call = async (method, path, body) => {
  const token = jwt.sign({ id: 'ADM1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const approve = (b) => { DB = [b]; return call('PATCH', '/api/bookings/CZ-1/admin-update', { status: 'Approved' }); };
const assign = (b, assignments) => { DB = [b]; return call('PATCH', '/api/bookings/CZ-1/assign', { assignments }); };

const none = [];
const lead = [{ lead: 'T1', helper: null }];
const pair = [{ lead: 'T1', helper: 'T2' }];

// ---- what each service needs
test('what each service type needs by default: a pair, except a check-up', () => {
  TYPES.forEach((t) => assert.equal(getMinTechnicians(svc(t)), t === 'Check-up' ? 1 : 2, t));
});

test('flag 2 always needs a pair; flag 1 is honored only on a check-up or a survey marked solo on type Other', () => {
  assert.equal(getMinTechnicians(svc('Check-up', { minTechnicians: 2 })), 2);
  assert.equal(getMinTechnicians(svc('Other', { minTechnicians: 1 })), 1); // a survey, marked solo by the admin
  assert.equal(getMinTechnicians(svc('Other')), 2);
  ['Cleaning', 'Installation', 'Repair', 'Maintenance', 'Leak Repair'].forEach((t) => {
    assert.equal(getMinTechnicians(svc(t, { minTechnicians: 1 })), 2, `${t} flagged 1 still needs a pair`);
  });
  assert.equal(getMinTechnicians(null), 2);
  assert.equal(getMinTechnicians('S1'), 2);
});

test('staffed means at least two different technicians for a pair service, however they were added', () => {
  const cleaning = svc('Cleaning');
  assert.equal(isStaffed(none, cleaning), false);
  assert.equal(isStaffed(lead, cleaning), false);
  assert.equal(isStaffed([{ lead: 'T1', helper: null }, { lead: 'T3', helper: null }], cleaning), true, 'two technicians added one by one');
  assert.equal(isStaffed([{ lead: 'T1', helper: null }, { lead: 'T1', helper: null }], cleaning), false, 'the same technician twice is one');
  assert.equal(isStaffed(pair, cleaning), true);
  assert.equal(isStaffed([{ lead: 'T1', helper: null }, { lead: 'T3', helper: 'T4' }], cleaning), true);
  assert.equal(isStaffed(lead, svc('Check-up')), true);
  assert.equal(isStaffed(none, svc('Check-up')), false);
});

test('the messages name the service and say what to do', () => {
  assert.equal(staffingProblem(pair, svc('Cleaning')), null);
  assert.equal(staffingProblem(lead, svc('Cleaning')), 'Cleaning needs at least two technicians. Add another technician before approving.');
  assert.equal(staffingProblem(none, svc('Cleaning')), 'Cleaning needs at least two technicians. Assign them before approving.');
  assert.match(staffingProblem(lead, svc('Cleaning'), 'saving'), /technician cannot be removed/);
  assert.equal(staffingProblem(none, svc('Check-up')), 'Assign a technician before approving.');
});

// ---- approving, for each service type
TYPES.forEach((type) => {
  const solo = type === 'Check-up';

  test(`${type}: approving with nobody assigned is a 400`, async () => {
    const res = await approve(booking(svc(type), 'Pending', none));
    assert.equal(res.status, 400);
    assert.equal(DB[0].status, 'Pending');
  });

  test(`${type}: approving with one technician is ${solo ? 'allowed (solo)' : 'a 400 that says another technician is needed'}`, async () => {
    const res = await approve(booking(svc(type), 'Pending', lead));
    if (solo) {
      assert.equal(res.status, 200, JSON.stringify(res.body));
    } else {
      assert.equal(res.status, 400);
      assert.equal(res.body.message, `${type} needs at least two technicians. Add another technician before approving.`);
      assert.equal(DB[0].status, 'Pending', 'the booking is not approved');
    }
  });

  test(`${type}: approving with a lead and a helper is allowed`, async () => {
    const res = await approve(booking(svc(type), 'Pending', pair));
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});

test('two technicians added one by one are enough to approve a Cleaning', async () => {
  const res = await approve(booking(svc('Cleaning'), 'Pending', [{ lead: 'T1', helper: null }, { lead: 'T3', helper: null }]));
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('a survey marked solo (type Other, minTechnicians 1) can be approved with one technician', async () => {
  const res = await approve(booking(svc('Other', { name: 'Site Survey', minTechnicians: 1 }), 'Pending', lead));
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('a Cleaning flagged solo by mistake still needs a pair', async () => {
  const res = await approve(booking(svc('Cleaning', { minTechnicians: 1 }), 'Pending', lead));
  assert.equal(res.status, 400);
});

// ---- changing the assignment after approval
['Approved', 'In Progress'].forEach((status) => {
  PAIR_TYPES.concat(['Other']).forEach((type) => {
    test(`${type} ${status}: removing a technician is refused with a clear 400, and the assignment is unchanged`, async () => {
      const b = booking(svc(type), status, pair);
      const res = await assign(b, [{ technicianId: 'T1' }]);
      assert.equal(res.status, 400);
      assert.match(res.body.message, new RegExp(`^${type} needs at least two technicians`));
      assert.deepEqual(b.assignments, pair);
    });
  });

  test(`${status}: replacing the helper by another helper is fine`, async () => {
    const b = booking(svc('Cleaning'), status, pair);
    const res = await assign(b, [{ technicianId: 'T1', helperId: 'T3' }]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(b.assignments[0].helper, 'T3');
  });

  test(`${status}: a check-up can be changed to a solo technician`, async () => {
    const b = booking(svc('Check-up'), status, pair);
    const res = await assign(b, [{ technicianId: 'T1' }]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});

test('a Pending booking may be saved with a lead only while the admin is still choosing', async () => {
  const b = booking(svc('Cleaning'), 'Pending', pair);
  const res = await assign(b, [{ technicianId: 'T1' }]);
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('an existing Approved booking that is already understaffed is not changed by itself, only by an edit', async () => {
  // data is never rewritten: the rule only applies when someone acts on the booking
  const b = booking(svc('Cleaning'), 'Approved', lead);
  DB = [b];
  assert.deepEqual(b.assignments, lead);
  const fix = await assign(b, [{ technicianId: 'T1', helperId: 'T2' }]);
  assert.equal(fix.status, 200, JSON.stringify(fix.body));
});

test('technicians are picked one by one: two entries without helpers are saved in order, the first is the primary, and the booking can be approved', async () => {
  const b = booking(svc('Cleaning'), 'Pending', none);
  const saved = await assign(b, [{ technicianId: 'T1' }, { technicianId: 'T2' }]);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(b.assignments.map((a) => [a.lead, a.helper || null]), [['T1', null], ['T2', null]]);
  assert.equal(b.technician, 'T1', 'the first technician is the primary one');
  const approved = await approve(b);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
});
