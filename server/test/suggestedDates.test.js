// Run with: npm test (inside server/). When approving or assigning fails because nobody is free, or auto-assign finds nobody,
// the refusal carries the next dates when enough technicians are free (business days only: SUNDAY_CLOSED and closure dates
// honored). The admin can move the booking to one of those dates in one step, through the same approval as a customer's
// reschedule. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const scheduling = require('../constants/scheduling');
const { isSunday } = require('../utils/businessDays');
const { suggestFromBookings } = require('../utils/autoAssign');
const { addDays } = require('../utils/extensionDays');
const harness = require('./helpers/createBooking');

const { state, post, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const tech = (id) => ({ _id: id, name: `Tech ${id}`, role: 'staff', isActive: true, position: 'Technician' });
const busy = (date, a, b, id) => addBooking({ bookingId: id, customer: 'CUS9', service: cleaning, status: 'Approved', date, time: 'Morning', technician: a, assignments: [{ lead: a, helper: b }] });
const withSunday = async (closed, fn) => {
  const before = scheduling.SUNDAY_CLOSED;
  scheduling.SUNDAY_CLOSED = closed;
  try { return await fn(); } finally { scheduling.SUNDAY_CLOSED = before; }
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
      { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
      tech('T1'), tech('T2'), tech('T3'), tech('T4'),
    ],
    services: [cleaning],
  });
});
const admin = (method, path, body) => call(method, path, 'ADM1', body, { role: 'admin' });
const everyoneBusy = () => { busy(D, 'T1', 'T2', 'CZ-B1'); busy(D, 'T3', 'T4', 'CZ-B2'); };

test('approving a booking nobody can staff on its date returns the next free dates', async () => {
  everyoneBusy();
  addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', date: D, time: 'Morning', assignments: [] });
  const res = await admin('PATCH', '/CZ-1/admin-update', { status: 'Approved' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /needs at least two technicians/);
  assert.equal(res.body.suggestedDates.length, 3);
  res.body.suggestedDates.forEach((d) => { assert.ok(d > D); assert.equal(isSunday(d), false); });
  assert.deepEqual([...res.body.suggestedDates].sort(), res.body.suggestedDates, 'soonest first');
});

test('assigning a technician who is busy is a 409 that also carries the dates when enough are free', async () => {
  everyoneBusy();
  addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', date: D, time: 'Morning', assignments: [] });
  const res = await admin('PATCH', '/CZ-1/assign', { assignments: [{ technicianId: 'T1', helperId: 'T2' }] });
  assert.equal(res.status, 409);
  assert.ok(res.body.suggestedDates.length > 0);
});

test('a walk-in booking nobody can staff comes back with the dates, for the admin only', async () => {
  everyoneBusy();
  const made = await post({ date: D, time: 'Morning', customer: 'CUS2' }, 'ADM1', { role: 'admin' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.ok(made.body.suggestedDates.length > 0);
  assert.deepEqual(state.bookings.find((b) => b.bookingId === made.body.bookingId).assignments, []);

  const byCustomer = await post({ date: D, time: 'Morning' }, 'CUS1');
  assert.equal(byCustomer.status, 409, 'a customer is refused: the pairs are taken, and Pending requests hold their slot');
  assert.equal(byCustomer.body.suggestedDates, undefined, 'a customer is not given them');
});

test('no suggestions when someone is free on the date', async () => {
  busy(D, 'T1', 'T2', 'CZ-B1');
  addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', date: D, time: 'Morning', assignments: [] });
  const res = await admin('PATCH', '/CZ-1/assign', { assignments: [{ technicianId: 'T1', helperId: 'T2' }] });
  assert.equal(res.status, 409);
  const ok = await admin('PATCH', '/CZ-1/assign', { assignments: [{ technicianId: 'T3', helperId: 'T4' }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.suggestedDates, undefined);
});

test('closure dates and Sundays are skipped, with the switch on and off', async () => {
  const saturday = (() => { let k = addDays(goodDate(8), 0); while (new Date(`${k}T00:00:00Z`).getUTCDay() !== 6) k = addDays(k, 1); return k; })();
  const sunday = addDays(saturday, 1);
  const monday = addDays(saturday, 2);
  const technicians = [{ _id: 'T1' }, { _id: 'T2' }];
  const base = { booking: { bookingId: 'CZ-X', date: saturday, time: 'Morning' }, minTechnicians: 2, technicians, occupying: [], limit: 2 };
  await withSunday(true, async () => {
    assert.deepEqual(suggestFromBookings({ ...base, closedDates: new Set([monday]) }), [addDays(monday, 1), addDays(monday, 2)]);
  });
  await withSunday(false, async () => {
    assert.deepEqual(suggestFromBookings({ ...base, closedDates: new Set([monday]) }), [sunday, addDays(monday, 1)]);
  });
});

test('suggestions come from who is actually free: a date where only one technician is free is not offered for a pair', () => {
  const occupying = [{ bookingId: 'A', date: addDays(D, 1), time: 'Morning', assignments: [{ lead: 'T1', helper: 'T2' }] }, { bookingId: 'B', date: addDays(D, 1), time: 'Morning', assignments: [{ lead: 'T3', helper: null }] }];
  const out = suggestFromBookings({ booking: { bookingId: 'CZ-X', date: D, time: 'Morning' }, minTechnicians: 2, technicians: [{ _id: 'T1' }, { _id: 'T2' }, { _id: 'T3' }, { _id: 'T4' }], occupying, closedDates: new Set(), limit: 1 });
  assert.ok(!out.includes(addDays(D, 1)));
  assert.equal(suggestFromBookings({ booking: { bookingId: 'CZ-X', date: D, time: 'Morning' }, minTechnicians: 1, technicians: [{ _id: 'T1' }, { _id: 'T2' }, { _id: 'T3' }, { _id: 'T4' }], occupying, closedDates: new Set(), limit: 1 }).length, 1);
});

// ---- one click: use this date
test('an Approved booking is moved to a suggested date; the customer and the technicians are told', async () => {
  const booking = addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', date: D, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }] });
  const target = addDays(D, 3);
  const res = await admin('PATCH', '/CZ-1/reschedule/use-date', { date: isSunday(target) ? addDays(target, 1) : target, time: 'Afternoon' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(booking.time, 'Afternoon');
  assert.equal(booking.rescheduleRequest.status, 'Approved');
  assert.deepEqual(state.notes.map((n) => n.user).sort(), ['CUS1', 'T1', 'T2']);
  assert.match(state.notes.find((n) => n.user === 'CUS1').message, /moved by our team/);
});

test('the same approval rules apply: a closed day, a Sunday, a busy pair, a past date, the same slot, a wrong status', async () => {
  const booking = addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', date: D, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }] });
  const closed = addDays(D, 2);
  state.closures.push({ date: closed, reason: 'Holiday' });
  const open = (k) => { let key = k; while (isSunday(key) || key === closed) key = addDays(key, 1); return key; };
  const busyDate = open(addDays(D, 4));
  busy(busyDate, 'T1', 'T3', 'CZ-B1');

  assert.equal((await admin('PATCH', '/CZ-1/reschedule/use-date', { date: closed, time: 'Morning' })).status, 400);
  await withSunday(true, async () => {
    let sunday = addDays(D, 1);
    while (!isSunday(sunday)) sunday = addDays(sunday, 1);
    const res = await admin('PATCH', '/CZ-1/reschedule/use-date', { date: sunday, time: 'Morning' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /closed on Sundays/);
  });
  const clash = await admin('PATCH', '/CZ-1/reschedule/use-date', { date: busyDate, time: 'Morning' });
  assert.equal(clash.status, 409);
  assert.ok(Array.isArray(clash.body.suggestedDates));
  assert.equal((await admin('PATCH', '/CZ-1/reschedule/use-date', { date: '2020-01-01', time: 'Morning' })).status, 400);
  assert.equal((await admin('PATCH', '/CZ-1/reschedule/use-date', { date: D, time: 'Morning' })).status, 400);
  assert.equal((await admin('PATCH', '/CZ-1/reschedule/use-date', { date: addDays(D, 5), time: 'Noon' })).status, 400);
  booking.status = 'Completed';
  assert.equal((await admin('PATCH', '/CZ-1/reschedule/use-date', { date: open(addDays(D, 6)), time: 'Morning' })).status, 400);
  assert.equal(booking.date, D, 'nothing moved');
  assert.deepEqual(state.notes, []);
});

test('a Pending booking moves and is proposed again for the new date', async () => {
  const booking = addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', date: D, time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }] });
  const target = (() => { let k = addDays(D, 3); while (isSunday(k)) k = addDays(k, 1); return k; })();
  const res = await admin('PATCH', '/CZ-1/reschedule/use-date', { date: target, time: 'Morning' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(booking.date, target);
  assert.equal(booking.assignments.length, 1, 'a pair is proposed again');
});

test('only an admin can use it', async () => {
  addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', date: D, time: 'Morning', assignments: [{ lead: 'T1', helper: 'T2' }] });
  assert.equal((await call('PATCH', '/CZ-1/reschedule/use-date', 'CUS1', { date: addDays(D, 3), time: 'Morning' })).status, 403);
});
