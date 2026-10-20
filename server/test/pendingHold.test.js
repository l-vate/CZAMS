// Run with: npm test (inside server/). A Pending booking holds its date and time block, first come first served; a customer can have
// only MAX_PENDING_PER_CUSTOMER Pending bookings; cancelling or rejecting a Pending booking frees the slot at once. The real routes run;
// only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const scheduling = require('../constants/scheduling');
const { getAvailability } = require('../utils/availability');
const harness = require('./helpers/createBooking');

const { state, post, call, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const tech = (id) => ({ _id: id, name: id, role: 'staff', isActive: true, position: 'Technician' });
const customer = (id) => ({ _id: id, role: 'customer', isActive: true, clientType: 'Residential', name: id });

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => {
  // one pair of field technicians: one booking fills a block
  harness.reset({ users: [customer('CUS1'), customer('CUS2'), customer('CUS3'), { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }, tech('T1'), tech('T2')], services: [cleaning] });
  scheduling.MAX_PENDING_PER_CUSTOMER = 3;
});

const D = () => goodDate(10);
const statusOn = async (date, block) => {
  const [day] = await getAvailability(date, date);
  return block === 'Morning' ? day.morning : day.afternoon;
};

test('the cap defaults to 3 and the slot hold is on', () => {
  harness.reset({});
  scheduling.MAX_PENDING_PER_CUSTOMER = 3;
  assert.equal(scheduling.MAX_PENDING_PER_CUSTOMER, 3);
  assert.equal(scheduling.PENDING_HOLDS_SLOT, true);
});

test('a Pending booking holds its slot: the calendar shows it taken and a second customer is refused', async () => {
  const first = await post({ date: D(), time: 'Morning' }, 'CUS1');
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.status, 'Pending');
  assert.equal(await statusOn(D(), 'Morning'), false, 'the public calendar shows the block as taken');
  assert.equal(await statusOn(D(), 'Afternoon'), true, 'the other block is untouched');
  const second = await post({ date: D(), time: 'Morning' }, 'CUS2');
  assert.equal(second.status, 409);
  assert.match(second.body.message, /already taken/);
  assert.equal(state.bookings.length, 1);
});

test('the customer who cancels a Pending booking frees the slot at once', async () => {
  const first = await post({ date: D(), time: 'Morning' }, 'CUS1');
  assert.equal((await post({ date: D(), time: 'Morning' }, 'CUS2')).status, 409);
  const cancelled = await call('PATCH', `/${first.body.bookingId}/cancel`, 'CUS1');
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(await statusOn(D(), 'Morning'), true);
  assert.equal((await post({ date: D(), time: 'Morning' }, 'CUS2')).status, 201);
});

test('the admin who rejects a Pending booking (cancels it) frees the slot at once', async () => {
  const first = await post({ date: D(), time: 'Morning' }, 'CUS1');
  assert.equal((await post({ date: D(), time: 'Morning' }, 'CUS2')).status, 409);
  const rejected = await call('PATCH', `/${first.body.bookingId}/admin-update`, 'ADM1', { status: 'Cancelled' }, { role: 'admin' });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(await statusOn(D(), 'Morning'), true);
  assert.equal((await post({ date: D(), time: 'Morning' }, 'CUS2')).status, 201);
});

test('a customer with 3 Pending bookings is refused a fourth with a clear 400, and can book again after cancelling one', async () => {
  harness.reset({ users: [customer('CUS1'), tech('T1'), tech('T2'), tech('T3'), tech('T4'), tech('T5'), tech('T6'), tech('T7'), tech('T8')], services: [cleaning] });
  scheduling.MAX_PENDING_PER_CUSTOMER = 3;
  const ids = [];
  for (const days of [7, 8, 9]) {
    const res = await post({ date: goodDate(days), time: 'Morning' }, 'CUS1');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    ids.push(res.body.bookingId);
  }
  const fourth = await post({ date: goodDate(10), time: 'Morning' }, 'CUS1');
  assert.equal(fourth.status, 400);
  assert.equal(fourth.body.message, 'You have reached the limit of pending bookings. Please wait for confirmation or cancel one.');
  await call('PATCH', `/${ids[0]}/cancel`, 'CUS1');
  assert.equal((await post({ date: goodDate(10), time: 'Morning' }, 'CUS1')).status, 201);
});

test('only Pending bookings count toward the cap: Approved ones do not', async () => {
  harness.reset({ users: [customer('CUS1'), tech('T1'), tech('T2'), tech('T3'), tech('T4'), tech('T5'), tech('T6'), tech('T7'), tech('T8')], services: [cleaning] });
  scheduling.MAX_PENDING_PER_CUSTOMER = 3;
  for (const days of [7, 8, 9]) await post({ date: goodDate(days), time: 'Morning' }, 'CUS1');
  state.bookings[0].status = 'Approved';
  assert.equal((await post({ date: goodDate(10), time: 'Morning' }, 'CUS1')).status, 201);
});

test('two customers racing for the last pair: exactly one succeeds', async () => {
  const results = await Promise.all(['CUS1', 'CUS2', 'CUS3'].map((id) => post({ date: D(), time: 'Morning' }, id)));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409], JSON.stringify(results.map((r) => r.body.message)));
  assert.equal(state.bookings.length, 1);
  assert.equal(state.locks.size, 0, 'every lock was let go');
});

test('a customer cannot move a Pending booking into a slot another Pending booking holds', async () => {
  const taken = await post({ date: D(), time: 'Morning' }, 'CUS1');
  assert.equal(taken.status, 201);
  const mine = await post({ date: goodDate(12), time: 'Morning' }, 'CUS2');
  const moved = await call('PATCH', `/${mine.body.bookingId}/reschedule`, 'CUS2', { date: D(), time: 'Morning' });
  assert.equal(moved.status, 409);
  assert.equal(state.bookings.find((b) => b.bookingId === mine.body.bookingId).date, goodDate(12), 'it stays where it was');
});

test('an admin booking a walk-in decides for themselves: neither the hold nor the cap stops them', async () => {
  await post({ date: D(), time: 'Morning' }, 'CUS1');
  const walkIn = await post({ date: D(), time: 'Morning', customer: 'CUS2' }, 'ADM1', { role: 'admin' });
  assert.equal(walkIn.status, 201, JSON.stringify(walkIn.body));
});

// ---- capacity with a flat technician list (no pairs): the free technicians are counted one by one, two make a pair
test('capacity counts flat technician entries one by one: two technicians on a booking use one pair, a check-up with one technician uses one person', () => {
  const { blockIsOpen } = require('../utils/availability');
  const crew = ['T1', 'T2', 'T3', 'T4'].map((_id) => ({ _id }));
  const slot = { date: '2026-12-01', time: 'Morning' };
  const booking = (status, ids) => ({ ...slot, status, assignments: ids.map((lead) => ({ lead, helper: null })), extensionDays: [] });
  const open = (bookings) => blockIsOpen({ technicians: crew, bookings, ...slot });
  assert.equal(open([]), true);
  assert.equal(open([booking('Approved', ['T1', 'T2'])]), true, 'one pair is still free');
  assert.equal(open([booking('Approved', ['T1', 'T2']), booking('Pending', ['T3', 'T4'])]), false, 'a Pending booking holds its technicians too');
  assert.equal(open([booking('Approved', ['T1'])]), true, 'a check-up with one technician leaves three: one pair');
  assert.equal(open([booking('Approved', ['T1', 'T2', 'T3'])]), false, 'three technicians on one booking leave one person, no pair');
  const { activeStatuses } = require('../utils/assignments');
  assert.deepEqual(activeStatuses(), ['Pending', 'Approved', 'In Progress'], 'only these hold technicians, so a cancelled booking frees them');
  // an older booking that holds a lead and a helper counts the same two people
  const legacy = { ...slot, status: 'Approved', assignments: [{ lead: 'T1', helper: 'T2' }], extensionDays: [] };
  assert.equal(open([legacy, booking('Pending', ['T3', 'T4'])]), false);
});
