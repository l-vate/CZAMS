// Run with: npm test (inside server/). Only the admin (the owner) can go past the 3-day lead time, and only the admin can approve, reject or
// move a booking. A customer is held to the lead time on every path (book, reschedule); an admin booking a walk-in is too; the one way
// past it is the admin moving a booking (reschedule/use-date), which a customer or a technician cannot do. Sunday and closed dates stay
// blocked even for the admin. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = require('../utils/extensionDays');

const { state, post, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const tech = (id) => ({ _id: id, name: id, role: 'staff', isActive: true, position: 'Technician' });
const people = () => [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  tech('T1'), tech('T2'), tech('T3'), tech('T4'),
];
const pending = () => addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', units: [{ type: 'Split Type', quantity: 1 }], date: goodDate(10), time: 'Morning', assignments: [] });

const today = () => manilaTodayKey();
// the next day that is a Sunday, at least 8 days out
const nextSunday = () => { let d = addDays(today(), 8); while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) d = addDays(d, 1); return d; };

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users: people(), services: [cleaning] }));

test('booking: a customer and an admin walk-in are both refused a date less than 3 days ahead; there is no override on creating a booking', async () => {
  for (const days of [0, 1, 2]) {
    const customer = await post({ date: addDays(today(), days) });
    assert.equal(customer.status, 400, `customer, ${days} days`);
    assert.match(customer.body.message, /at least 3 days/);
    const admin = await post({ date: addDays(today(), days), customer: 'CUS1' }, 'ADM1', { role: 'admin' });
    assert.equal(admin.status, 400, `admin, ${days} days`);
  }
  assert.equal(state.bookings.length, 0);
});

test('a customer is held to the lead time when rescheduling too', async () => {
  pending();
  const res = await call('PATCH', '/CZ-1/reschedule', 'CUS1', { date: addDays(today(), 1), time: 'Morning' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /at least 3 days/);
});

test('the admin moving a booking is the way past the lead time: a booking can be moved to tomorrow', async () => {
  const b = pending();
  const tomorrow = addDays(today(), 1);
  const date = new Date(`${tomorrow}T00:00:00Z`).getUTCDay() === 0 ? addDays(today(), 2) : tomorrow;
  const res = await call('PATCH', '/CZ-1/reschedule/use-date', 'ADM1', { date, time: 'Afternoon' }, { role: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.date, date);
});

test('a customer and a technician get 403 on that route, and on the disruption reschedule', async () => {
  const b = pending();
  const date = addDays(today(), 2);
  const original = b.date;
  assert.equal((await call('PATCH', '/CZ-1/reschedule/use-date', 'CUS1', { date, time: 'Morning' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/reschedule/use-date', 'T1', { date, time: 'Morning' }, { role: 'staff' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/disruption/reschedule', 'CUS1', { date, time: 'Morning' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/disruption/reschedule', 'T1', { date, time: 'Morning' }, { role: 'staff' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/reschedule/approve', 'T1', {}, { role: 'staff' })).status, 403);
  assert.equal(b.date, original, 'nothing moved');
});

test('Sunday stays blocked even for the admin\'s override', async () => {
  const b = pending();
  const sunday = nextSunday();
  const res = await call('PATCH', '/CZ-1/reschedule/use-date', 'ADM1', { date: sunday, time: 'Morning' }, { role: 'admin' });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(res.body.message, /closed on Sundays/);
  assert.notEqual(b.date, sunday);
});

test('a date the admin closed stays blocked for the admin\'s override too', async () => {
  const b = pending();
  const closed = goodDate(12);
  state.closures.push({ date: closed, reason: 'Holiday' });
  const res = await call('PATCH', '/CZ-1/reschedule/use-date', 'ADM1', { date: closed, time: 'Morning' }, { role: 'admin' });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.notEqual(b.date, closed);
});

test('a technician cannot approve, reject (cancel) or edit a booking; a customer cannot approve; the admin can approve', async () => {
  const b = pending();
  b.assignments = [{ lead: 'T1', helper: 'T2' }];
  b.technician = 'T1';
  assert.equal((await call('PATCH', '/CZ-1/admin-update', 'T1', { status: 'Approved' }, { role: 'staff' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/admin-update', 'T1', { status: 'Cancelled' }, { role: 'staff' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/admin-update', 'CUS1', { status: 'Approved' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/assign', 'T1', { assignments: [{ technicianId: 'T1', helperId: 'T2' }] }, { role: 'staff' })).status, 403);
  assert.equal(b.status, 'Pending');
  const ok = await call('PATCH', '/CZ-1/admin-update', 'ADM1', { status: 'Approved' }, { role: 'admin' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(b.status, 'Approved');
});

test('a technician cannot create a booking at all', async () => {
  assert.equal((await post({ date: goodDate(9) }, 'T1', { role: 'staff' })).status, 403);
});
