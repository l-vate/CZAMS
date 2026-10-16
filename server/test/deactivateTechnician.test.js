// Run with: npm test (inside server/). Deactivating a field technician who still has open jobs (Pending, Approved or In
// Progress) is refused with the list of those jobs unless the admin confirms. With the confirmation the account is
// deactivated, the jobs are flagged as needing a new technician, every admin is told, and the flag clears when someone
// else is assigned. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const AuditLog = require('../models/AuditLog');
const { authCache } = require('../utils/authCache');
const harness = require('./helpers/createBooking');

const { state, call, addBooking } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const job = (id, over = {}) => addBooking({ bookingId: id, customer: 'CUS1', service: cleaning, status: 'Approved', date: '2026-11-10', time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], ...over });

test.before(async () => {
  await harness.install();
  AuditLog.create = async () => ({});
});
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One', email: 'a@x.co' },
    { _id: 'ADM2', role: 'admin', isActive: true, name: 'Admin Two', email: 'b@x.co' },
    { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer', email: 'c@x.co' },
    { _id: 'T1', role: 'staff', isActive: true, name: 'Ana Tech', position: 'Technician', email: 't1@x.co' },
    { _id: 'T2', role: 'staff', isActive: true, name: 'Ben Tech', position: 'Technician', email: 't2@x.co' },
    { _id: 'SEC1', role: 'staff', isActive: true, name: 'Sue Secretary', position: 'Secretary', email: 's@x.co' },
  ],
  services: [cleaning],
}));

// the harness mounts the user routes at /api/users
const put2 = (id, body) => harness.callPath('PUT', `/api/users/${id}`, 'ADM1', body, { role: 'admin' });

test('a technician with open jobs is refused with the list, and nothing changes', async () => {
  job('CZ-1');
  job('CZ-2', { status: 'Pending', technician: 'T2', assignments: [{ lead: 'T2', helper: 'T1' }] });
  job('CZ-3', { status: 'In Progress' });
  const res = await put2('T1', { isActive: false });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.needsConfirmation, true);
  assert.deepEqual(res.body.openBookings.map((b) => b.bookingId).sort(), ['CZ-1', 'CZ-2', 'CZ-3']);
  assert.match(res.body.message, /still has 3 open jobs/);
  assert.equal(state.users.find((u) => u._id === 'T1').isActive, true);
  assert.equal(state.bookings.some((b) => b.needsReassignment), false);
});

test('with the confirmation the account is deactivated, the jobs are flagged, and every admin is told once', async () => {
  job('CZ-1');
  job('CZ-2', { status: 'Pending' });
  const res = await put2('T1', { isActive: false, confirmReassign: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(state.users.find((u) => u._id === 'T1').isActive, false);
  assert.deepEqual(state.bookings.map((b) => b.needsReassignment), [true, true]);
  const told = state.notes.filter((n) => n.type === 'technician_deactivated');
  assert.deepEqual(told.map((n) => n.user).sort(), ['ADM1', 'ADM2']);
  assert.match(told[0].message, /Ana Tech.*2 open jobs.*CZ-1, CZ-2/);
});

test('only open jobs count: Completed and Cancelled ones do not hold the deactivation back or get flagged', async () => {
  job('CZ-1', { status: 'Completed' });
  job('CZ-2', { status: 'Cancelled' });
  const res = await put2('T1', { isActive: false });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(state.bookings.some((b) => b.needsReassignment), false);
  assert.equal(state.notes.some((n) => n.type === 'technician_deactivated'), false);
});

test('a technician with no jobs, and accounts that are not field technicians, deactivate without asking', async () => {
  assert.equal((await put2('T2', { isActive: false })).status, 200);
  assert.equal((await put2('SEC1', { isActive: false })).status, 200);
  job('CZ-9', { technician: 'SEC1', assignments: [{ lead: 'SEC1', helper: null }] });
  assert.equal((await put2('CUS1', { isActive: false })).status, 200);
});

test('the confirmation is a real true: the text "true" does not count', async () => {
  job('CZ-1');
  const res = await put2('T1', { isActive: false, confirmReassign: 'true' });
  assert.equal(res.status, 409);
  assert.equal(state.users.find((u) => u._id === 'T1').isActive, true);
});

test('reactivating, or editing other details, never asks', async () => {
  job('CZ-1');
  state.users.find((u) => u._id === 'T2').isActive = false;
  assert.equal((await put2('T2', { isActive: true })).status, 200);
  assert.equal((await put2('T1', { phone: '09171234567' })).status, 200);
});

test('a deactivated account is signed out on its next request (the freshness check), and the flag clears when someone else is assigned', async () => {
  job('CZ-1', { status: 'Pending' });
  await put2('T1', { isActive: false, confirmReassign: true });
  authCache.clear();
  const asTech = await harness.callPath('GET', '/api/bookings/technician/mine', 'T1', undefined, { role: 'staff' });
  assert.equal(asTech.status, 403);
  assert.match(asTech.body.message, /deactivated/);

  // the assignment route clears the flag (performAssignment sets it false on the saved booking)
  const booking = state.bookings[0];
  assert.equal(booking.needsReassignment, true);
  const res = await call('PATCH', '/CZ-1/assign', 'ADM1', { assignments: [{ technicianId: 'T2' }] }, { role: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(booking.needsReassignment, false);
});
