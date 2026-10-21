// Run with: npm test (inside server/). The technicians on a Pending booking are only a proposal: the customer does not
// see them until the booking is Approved, and when the customer moves a Pending booking to a new date the proposal is
// dropped and made again for that date instead of failing with a 409 because the proposed technicians are busy.
// Pending bookings still hold their slot (PENDING_HOLDS_SLOT is not changed). The real routes run; only the database
// is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const Booking = require('../models/Booking');
const { toCustomerView } = require('../utils/customerView');
const harness = require('./helpers/createBooking');

const { state, post, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const tech = (id, name) => ({ _id: id, name, role: 'staff', isActive: true, position: 'Technician' });
const ALL = () => [tech('T1', 'Tech One'), tech('T2', 'Tech Two'), tech('T3', 'Tech Three'), tech('T4', 'Tech Four')];
const names = (booking) => (booking.assignments || []).flatMap((a) => [a.lead, a.helper]).filter(Boolean).sort();
const busyOn = (date, ids) => addBooking({ bookingId: `CZ-BUSY-${date}-${ids[0]}`, customer: 'CUS9', service: cleaning, status: 'Approved', date, time: 'Morning', technician: ids[0], assignments: [{ lead: ids[0], helper: ids[1] || null }] });

let history;
test.before(async () => {
  await harness.install();
  const realUpdateOne = Booking.updateOne;
  Booking.updateOne = async (f, update) => {
    if (update.$push && update.$push.assignmentHistory) history.push(update.$push.assignmentHistory);
    return realUpdateOne(f, update);
  };
});
test.after(() => harness.close());
test.beforeEach(() => {
  history = [];
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }, { _id: 'ADM1', role: 'admin', isActive: true }, ...ALL()],
    services: [cleaning],
  });
});

const D1 = () => goodDate(7);
const D2 = () => goodDate(11);

test('a new Pending booking is proposed technicians, but the customer sees none', async () => {
  const res = await post({ date: D1() });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(names(saved).length, 2, 'a pair was proposed');
  assert.deepEqual(res.body.assignments, []);
  assert.equal(res.body.technician, null);
  assert.equal(JSON.stringify(res.body).includes('Tech '), false, 'no technician name anywhere in the answer');
});

test('the customer view shows technician names from Approved on, and none for Pending or Cancelled', () => {
  const base = { bookingId: 'CZ-1', technician: { _id: 'T1', name: 'Tech One' }, assignments: [{ lead: { _id: 'T1', name: 'Tech One' }, helper: { _id: 'T2', name: 'Tech Two' } }] };
  ['Approved', 'In Progress', 'Completed'].forEach((status) => {
    const v = toCustomerView({ ...base, status });
    assert.deepEqual(v.technician, { name: 'Tech One' }, status);
    assert.equal(v.assignments[0].helper.name, 'Tech Two', status);
  });
  ['Pending', 'Cancelled'].forEach((status) => {
    const v = toCustomerView({ ...base, status });
    assert.equal(v.technician, null, status);
    assert.deepEqual(v.assignments, [], status);
  });
});

test('moving a Pending booking to a date the proposed pair is busy is a 200: the proposal is dropped and made again with whoever is free', async () => {
  await post({ date: D1() });
  const proposed = names(state.bookings[0]);
  const date2 = D2();
  busyOn(date2, [proposed[0], proposed[1]]);
  const res = await call('PATCH', `/${state.bookings[0].bookingId}/reschedule`, 'CUS1', { date: date2, time: 'Morning' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.date, date2);
  assert.equal(saved.status, 'Pending');
  const now = names(saved);
  assert.equal(now.length, 2, 'a new pair was proposed');
  assert.equal(now.some((id) => proposed.includes(id)), false, 'not the technicians who are busy that day');
  assert.deepEqual(res.body.assignments, [], 'the customer still sees none');
  assert.ok(history.length >= 3, 'the first proposal, the drop and the new proposal are all in the history');
  assert.deepEqual(history[history.length - 2].next, [], 'the entry before the last is the drop');
  assert.equal(history[history.length - 2].previous.length, 1);
});

test('when nobody is free on the new date the move is refused with a 409 and the booking stays where it was', async () => {
  await post({ date: D1() });
  const date2 = D2();
  busyOn(date2, ['T1', 'T2']);
  busyOn(date2, ['T3', 'T4']);
  const res = await call('PATCH', `/${state.bookings[0].bookingId}/reschedule`, 'CUS1', { date: date2, time: 'Morning' });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(state.bookings[0].date, D1());
  assert.equal(names(state.bookings[0]).length, 2, 'it keeps its pair');
});

test('a Pending booking that has nobody yet is proposed someone when it moves', async () => {
  await post({ date: D1() });
  Object.assign(state.bookings[0], { assignments: [], technician: undefined });
  const res = await call('PATCH', `/${state.bookings[0].bookingId}/reschedule`, 'CUS1', { date: D2(), time: 'Afternoon' });
  assert.equal(res.status, 200);
  assert.equal(names(state.bookings[0]).length, 2);
});

test('an Approved booking is not re-proposed: its team stays and the move waits for the admin', async () => {
  await post({ date: D1() });
  const booking = state.bookings[0];
  const team = names(booking);
  booking.status = 'Approved';
  const res = await call('PATCH', `/${booking.bookingId}/reschedule`, 'CUS1', { date: D2(), time: 'Morning' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(names(booking), team);
  assert.equal(booking.date, D1(), 'the date waits for approval');
  assert.equal(booking.rescheduleRequest.status, 'Pending');
  assert.equal(res.body.status, 'Approved');
});
