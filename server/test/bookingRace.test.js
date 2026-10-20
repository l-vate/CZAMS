// Run with: npm test (inside server/). Two requests at the same moment must not both get through a check that only one may pass: the same
// customer sending the same booking twice (a double click), and two customers being proposed the same technicians. The checks and the writes
// happen while holding a short lock (utils/slotLock.js). The real routes run; the database is replaced by in-memory stand-ins, whose lock
// collection refuses a second lock with the same _id like MongoDB's unique index does. That the real database behaves the same is checked
// against CZAMS_audit_test (docs of the audit pass), because a stand-in cannot prove atomicity.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const Booking = require('../models/Booking');
const Lock = require('../models/Lock');
const { withLocks, LockBusyError } = require('../utils/slotLock');
const { installLockStub } = require('./helpers/stubLocks');

const { state, post, call, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const repair = { _id: 'S-REPAIR', name: 'Repair', serviceType: 'Repair', price: 800, isActive: true };
const people = () => [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
  { _id: 'CUS2', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer Two' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  { _id: 'STF1', role: 'staff', isActive: true, name: 'Lead', position: 'Lead Technician' },
  { _id: 'STF2', role: 'staff', isActive: true, name: 'Helper', position: 'Helper' },
  // more crew, so several bookings in one slot are not refused as full
  ...['STF3', 'STF4', 'STF5', 'STF6', 'STF7', 'STF8', 'STF9', 'STF10', 'STF11', 'STF12'].map((id) => ({ _id: id, role: 'staff', isActive: true, name: id, position: 'Technician' })),
];

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users: people(), services: [cleaning, repair] }));

const SAME = { date: goodDate(7), time: 'Morning' };
const many = (n, fn) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
const count = (results, status) => results.filter((r) => r.status === status).length;

test('ten identical submissions at once make exactly one booking, and the other nine are told they already submitted it', async () => {
  const results = await many(10, () => post({ ...SAME }, 'CUS1'));
  assert.equal(count(results, 201), 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(count(results, 409), 9);
  results.filter((r) => r.status === 409).forEach((r) => assert.equal(r.body.message, 'You already submitted this booking'));
  assert.equal(state.bookings.length, 1);
  assert.equal(state.locks.size, 0, 'every lock was let go');
});

test('sending it again afterwards is refused too, while the first booking is alive', async () => {
  assert.equal((await post({ ...SAME }, 'CUS1')).status, 201);
  const again = await post({ ...SAME }, 'CUS1');
  assert.equal(again.status, 409);
  assert.equal(again.body.message, 'You already submitted this booking');
  assert.equal(state.bookings.length, 1);
});

test('a different unit count, service, block, date or customer is not a duplicate', async () => {
  assert.equal((await post({ ...SAME }, 'CUS1')).status, 201);
  assert.equal((await post({ ...SAME, units: [{ type: 'Split Type', quantity: 2 }] }, 'CUS1')).status, 201, 'other units');
  assert.equal((await post({ ...SAME, service: 'S-REPAIR' }, 'CUS1')).status, 201, 'other service');
  assert.equal((await post({ ...SAME, time: 'Afternoon' }, 'CUS1')).status, 201, 'other block');
  assert.equal((await post({ ...SAME, date: goodDate(8) }, 'CUS1')).status, 201, 'other date');
  assert.equal((await post({ ...SAME }, 'CUS2')).status, 201, 'other customer');
  assert.equal(state.bookings.length, 6);
});

test('once the first booking is cancelled or completed, the same booking can be made again', async () => {
  await post({ ...SAME }, 'CUS1');
  state.bookings[0].status = 'Cancelled';
  assert.equal((await post({ ...SAME }, 'CUS1')).status, 201);
  state.bookings[1].status = 'Completed';
  assert.equal((await post({ ...SAME }, 'CUS1')).status, 201);
});

test('an admin booking a walk-in goes through the same protection', async () => {
  const walkIn = () => post({ ...SAME, customer: 'CUS1' }, 'ADM1', { role: 'admin' });
  const results = await many(6, walkIn);
  assert.equal(count(results, 201), 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(count(results, 409), 5);
  assert.equal((await post({ ...SAME }, 'CUS1')).status, 409, 'and the customer sending the same booking is refused as well');
});

test('a booking that cannot be saved lets its lock go, so the next try works', async () => {
  const real = Booking.create;
  Booking.create = async () => { throw new Error('the database is down'); };
  try {
    assert.equal((await post({ ...SAME }, 'CUS1')).status, 500);
  } finally {
    Booking.create = real;
  }
  assert.equal(state.locks.size, 0);
  assert.equal((await post({ ...SAME }, 'CUS1')).status, 201);
});

test('two customers asking for the last pair at the same moment: only one gets the slot, the other is told it is taken', async () => {
  harness.reset({ users: people().slice(0, 5), services: [cleaning, repair] }); // exactly one pair of field technicians
  const results = await many(2, (i) => post({ ...SAME, service: 'S-CLEAN' }, i === 0 ? 'CUS1' : 'CUS2'));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], JSON.stringify(results.map((r) => r.body.message)));
  assert.equal(state.bookings.length, 1);
  assert.equal(state.bookings[0].assignments.length, 1, 'the winner holds the pair');
  assert.equal(state.locks.size, 0);
});

test('an admin assigning the same technician to two bookings at once: only one of them gets them', async () => {
  await post({ ...SAME, service: 'S-REPAIR' }, 'CUS1');
  await post({ ...SAME, service: 'S-CLEAN' }, 'CUS2');
  state.bookings.forEach((b) => { b.assignments = []; b.technician = undefined; });
  const [a, b] = state.bookings.map((x) => x.bookingId);
  const assign = (id) => call('PATCH', `/${id}/assign`, 'ADM1', { assignments: [{ technicianId: 'STF1', helperId: 'STF2' }] }, { role: 'admin' });
  const results = await Promise.all([assign(a), assign(b)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409], JSON.stringify(results.map((r) => r.body.message)));
  assert.equal(state.locks.size, 0);
});

// ---- the lock itself
test.describe('the lock helper', () => {
  test.beforeEach(() => installLockStub());

  test('runs the function once per turn and lets go, also when the function fails', async () => {
    let inside = 0;
    let peak = 0;
    const turn = async () => withLocks(['k'], async () => { inside += 1; peak = Math.max(peak, inside); await new Promise((r) => { setTimeout(r, 15); }); inside -= 1; });
    await Promise.all([turn(), turn(), turn()]);
    assert.equal(peak, 1, 'never two at once');
    await assert.rejects(withLocks(['k'], async () => { throw new Error('boom'); }), /boom/);
    await withLocks(['k'], async () => {}); // not stuck
  });

  test('waits for a lock that is held, gives up with a clear error after the wait, and takes over one that has expired', async () => {
    await Lock.create({ _id: 'held', expiresAt: new Date(Date.now() + 60000) });
    await assert.rejects(withLocks(['held'], async () => {}, { waitMs: 120 }), LockBusyError);
    await Lock.create({ _id: 'old', expiresAt: new Date(Date.now() - 1000) }).catch(() => {});
    await Lock.create({ _id: 'stale', expiresAt: new Date(Date.now() - 1000) });
    let ran = false;
    await withLocks(['stale'], async () => { ran = true; }, { waitMs: 500 });
    assert.equal(ran, true);
  });

  test('several keys are taken in a fixed order, so two requests wanting the same pair cannot deadlock', async () => {
    const order = [];
    await Promise.all([
      withLocks(['b', 'a'], async () => { order.push('first'); await new Promise((r) => { setTimeout(r, 10); }); }),
      withLocks(['a', 'b'], async () => { order.push('second'); }),
    ]);
    assert.equal(order.length, 2);
  });
});
