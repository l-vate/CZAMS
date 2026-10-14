// Run with: npm test (inside server/). Moving a Pending request in the queue makes the system's proposals for that date and time
// block again, in queue order: a request higher up keeps (or gets) its pair, a lower one is proposed whoever is left. Only the
// system's own proposals on Pending bookings change: an Approved booking, a Pending one an admin assigned by hand, and other time
// blocks never do. With PENDING_HOLDS_SLOT off the order cannot change who is proposed, so nothing is redone. The real routes
// run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const scheduling = require('../constants/scheduling');
const harness = require('./helpers/createBooking');

const { state, post, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const tech = (id) => ({ _id: id, name: `Tech ${id}`, role: 'staff', isActive: true, position: 'Technician' });
const members = (booking) => (booking.assignments || []).flatMap((a) => [a.lead, a.helper]).filter(Boolean).sort();
const byId = (id) => state.bookings.find((b) => b.bookingId === id);
const withHolds = async (value, fn) => {
  const before = scheduling.PENDING_HOLDS_SLOT;
  scheduling.PENDING_HOLDS_SLOT = value;
  try { return await fn(); } finally { scheduling.PENDING_HOLDS_SLOT = before; }
};
let D;

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => {
  D = goodDate(10);
  harness.reset({
    users: [
      { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
      { _id: 'CUS2', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer Two' },
      { _id: 'CUS3', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer Three' },
      { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
      tech('T1'), tech('T2'), tech('T3'), tech('T4'),
    ],
    services: [cleaning],
  });
});
const move = (id, action) => call('PATCH', `/${id}/queue`, 'ADM1', { action }, { role: 'admin' });

// three requests for one block, with only two pairs of technicians, from three customers (one customer cannot send the same booking twice)
const three = async () => {
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    const res = await post({ date: D, time: 'Morning' }, `CUS${i + 1}`);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    ids.push(res.body.bookingId);
  }
  return ids;
};

test('the first two requests get the two pairs, the third gets nobody', async () => {
  const [a, b, c] = await three();
  assert.equal(members(byId(a)).length, 2);
  assert.equal(members(byId(b)).length, 2);
  assert.equal(members(byId(c)).length, 0);
  assert.equal(new Set([...members(byId(a)), ...members(byId(b))]).size, 4, 'nobody on two requests');
});

test('moving the third request to the top gives it a pair, and the one now last is left with nobody', async () => {
  const [a, b, c] = await three();
  const res = await move(c, 'top');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(members(byId(c)).length, 2, 'now first in the queue');
  assert.equal(members(byId(a)).length, 2, 'second keeps a pair');
  assert.equal(members(byId(b)).length, 0, 'now last');
  assert.equal(new Set([...members(byId(c)), ...members(byId(a))]).size, 4);
});

test('the change is recorded in the assignment history as the system acting, with the reason', async () => {
  const [, , c] = await three();
  await move(c, 'top');
  const lines = (byId(c).assignmentHistory || []).map((h) => h.reason);
  assert.ok(lines.includes('Proposed again after the queue order changed'), JSON.stringify(lines));
});

test('a Pending booking an admin assigned by hand keeps its pair, and an Approved booking never changes', async () => {
  const [a, , c] = await three();
  // the admin chose A by hand
  byId(a).assignmentHistory = [{ reason: 'Chosen by Admin One', previous: [], next: [] }];
  const approved = addBooking({ bookingId: 'CZ-APPROVED', customer: 'CUS1', service: cleaning, status: 'Approved', date: D, time: 'Afternoon', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }] });
  const before = members(byId(a));
  await move(c, 'top');
  assert.deepEqual(members(byId(a)), before);
  assert.deepEqual(members(approved), ['T1', 'T2']);
  assert.equal(approved.status, 'Approved');
});

test('requests in another time block or on another day are not touched', async () => {
  const [, , c] = await three();
  const other = await post({ date: D, time: 'Afternoon' });
  const another = await post({ date: goodDate(12), time: 'Morning' });
  const before = [members(byId(other.body.bookingId)), members(byId(another.body.bookingId))];
  await move(c, 'top');
  assert.deepEqual([members(byId(other.body.bookingId)), members(byId(another.body.bookingId))], before);
  assert.equal((byId(other.body.bookingId).assignmentHistory || []).filter((h) => /queue order/.test(h.reason || '')).length, 0);
});

test('with Pending requests not holding technicians the order changes nothing about who is proposed', async () => {
  const [a, b, c] = await three();
  const before = [a, b, c].map((id) => members(byId(id)));
  await withHolds(false, async () => {
    const res = await move(c, 'top');
    assert.equal(res.status, 200);
  });
  assert.deepEqual([a, b, c].map((id) => members(byId(id))), before);
});

test('moving a request that is not Pending, or with a bad action, changes nothing', async () => {
  const [a, , c] = await three();
  byId(c).status = 'Approved';
  assert.equal((await move(c, 'top')).status, 400);
  assert.equal((await move(a, 'sideways')).status, 400);
});

test('only an admin can move a request', async () => {
  const [, , c] = await three();
  assert.equal((await call('PATCH', `/${c}/queue`, 'CUS1', { action: 'top' })).status, 403);
});
