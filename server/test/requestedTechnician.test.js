// Run with: npm test (inside server/). A customer can request a technician. The request must be an active field
// technician, and the system proposes the requested technician as lead when they are free, falling back to the normal
// choice when they are busy. The proposal stays hidden from the customer (and from technicians) until the admin
// approves. The real route runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, post, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const tech = (id, name, over = {}) => ({ _id: id, name, role: 'staff', isActive: true, position: 'Technician', ...over });
const members = (booking) => (booking.assignments || []).flatMap((a) => [a.lead, a.helper]).filter(Boolean);
const leadOf = (booking) => booking.assignments[0] && booking.assignments[0].lead;

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
    { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
    tech('T1', 'Ana'), tech('T2', 'Ben'), tech('T3', 'Cara'), tech('T4', 'Dan'),
    tech('SEC1', 'Secretary Sue', { position: 'Secretary' }),
    tech('OFF1', 'Gone Gus', { isActive: false }),
  ],
  services: [cleaning],
}));

test('the requested technician leads the proposed pair when they are free', async () => {
  for (const id of ['T3', 'T4', 'T2']) {
    harness.state.bookings.length = 0;
    const res = await post({ technician: id });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(leadOf(state.bookings[0]), id, `${id} leads`);
    assert.equal(members(state.bookings[0]).length, 2, 'a pair');
    assert.equal(state.bookings[0].requestedTechnician, id, 'the request is kept on the booking');
  }
});

test('with no request the system chooses by the usual rule', async () => {
  const res = await post({});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(members(state.bookings[0]).length, 2);
});

test('a requested technician who is busy that day is not an error: someone else is proposed', async () => {
  const date = goodDate(9);
  addBooking({ bookingId: 'CZ-BUSY', customer: 'CUS9', service: cleaning, status: 'Approved', date, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }] });
  const res = await post({ technician: 'T1', date, time: 'Morning' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const mine = state.bookings.find((b) => b.bookingId !== 'CZ-BUSY');
  assert.deepEqual(members(mine).sort(), ['T3', 'T4'], 'the free pair');
  assert.equal(mine.requestedTechnician, 'T1', 'the request is still on the booking, for the admin to see');
});

test('a requested technician who is busy and nobody else free: the booking is saved unassigned', async () => {
  const date = goodDate(9);
  addBooking({ bookingId: 'CZ-B1', customer: 'CUS9', service: cleaning, status: 'Approved', date, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }] });
  addBooking({ bookingId: 'CZ-B2', customer: 'CUS9', service: cleaning, status: 'Approved', date, time: 'Morning', technician: 'T3', assignments: [{ lead: 'T3', helper: 'T4' }] });
  const res = await post({ technician: 'T1', date, time: 'Morning' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(members(state.bookings.find((b) => b.bookingId !== 'CZ-B1' && b.bookingId !== 'CZ-B2')), []);
});

test('only an active field technician can be requested', async () => {
  for (const technician of ['SEC1', 'OFF1', 'ADM1', 'CUS1', 'NOBODY', '{"$ne":""}']) {
    const res = await post({ technician });
    assert.equal(res.status, 400, technician);
    assert.match(res.body.message, /cannot be requested/);
  }
  assert.equal(state.bookings.length, 0);
});

test('the proposal is hidden from the customer until approval, even though the request is theirs', async () => {
  const res = await post({ technician: 'T3' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.assignments, []);
  assert.equal(res.body.technician, null);
  assert.equal(JSON.stringify(res.body).includes('Cara'), false);
});

test('a Pending proposal sends no notification to the technicians', async () => {
  await post({ technician: 'T3' });
  assert.deepEqual(state.notes.filter((n) => ['T1', 'T2', 'T3', 'T4'].includes(n.user)), []);
});
