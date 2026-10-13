// Run with: npm test (inside server/). Approving a customer's reschedule releases the extra days that belonged to the old
// schedule (the same rule as the disruption reschedule) and tells the technicians. The 3-day rule is NOT checked again at
// approval: it applies when the customer asks. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays, isSunday } = require('../utils/extensionDays');

const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const approve = () => call('PATCH', '/CZ-1/reschedule/approve', 'ADM1', {}, { role: 'admin' });
const open = (key) => { let k = key; while (isSunday(k)) k = addDays(k, 1); return k; };

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [{ _id: 'CUS1', role: 'customer', isActive: true }, { _id: 'ADM1', role: 'admin', isActive: true }, { _id: 'T1', role: 'staff', isActive: true }, { _id: 'T2', role: 'staff', isActive: true }],
  services: [cleaning],
}));

const job = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', date: goodDate(7), time: 'Morning', technician: 'T1',
  assignments: [{ lead: 'T1', helper: 'T2' }], extensionDays: [{ date: addDays(goodDate(7), 1), time: 'Morning' }, { date: addDays(goodDate(7), 2), time: 'Afternoon' }],
  rescheduleRequest: { status: 'Pending', requestedDate: goodDate(14), requestedTime: 'Afternoon' }, ...over,
});

test('approving releases the extra days of the old schedule and tells the technicians', async () => {
  const booking = job();
  const res = await approve();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(booking.date, goodDate(14));
  assert.deepEqual(booking.extensionDays, []);
  const forTech = state.notes.filter((n) => n.user === 'T1' || n.user === 'T2');
  assert.equal(forTech.length, 2, 'each technician once');
  assert.match(forTech[0].message, /extra days approved for the old schedule no longer apply/);
  assert.equal(state.notes.filter((n) => n.user === 'CUS1').length, 1);
});

test('a job with no extra days gets the plain message', async () => {
  job({ extensionDays: [] });
  await approve();
  const note = state.notes.find((n) => n.user === 'T1');
  assert.equal(note.message.includes('no longer apply'), false);
});

test('a pending request for another extra day is dropped with the old days', async () => {
  const booking = job({ extensionRequest: { status: 'Pending', requestedDate: goodDate(9), reason: 'More time' } });
  await approve();
  assert.equal(booking.extensionRequest.status, 'Denied');
});

test('the 3-day rule is not applied at approval: a request that is now closer than 3 days is still approved', async () => {
  const soon = open(addDays(manilaTodayKey(), 1));
  const booking = job({ rescheduleRequest: { status: 'Pending', requestedDate: soon, requestedTime: 'Morning' } });
  const res = await approve();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(booking.date, soon);
});

test('a refused approval (the pair is busy) leaves the old days in place', async () => {
  const target = goodDate(14);
  addBooking({ bookingId: 'CZ-B', customer: 'CUS9', service: cleaning, status: 'Approved', date: target, time: 'Afternoon', technician: 'T1', assignments: [{ lead: 'T1', helper: null }] });
  const booking = job();
  const res = await approve();
  assert.equal(res.status, 409);
  assert.equal(booking.extensionDays.length, 2);
  assert.equal(booking.date, goodDate(7));
});
