// Run with: npm test (inside server/). Back job claims: one open claim per booking (also when two are filed at the
// same moment, through the unique index), the free visit is dated two days after the claim in Manila and moved to the
// next business day, it stays unassigned and Pending for the admin, the customer is told when the claim is filed and
// when the admin decides it, and a free visit cannot itself be claimed against. The real routes run; only the database
// is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const scheduling = require('../constants/scheduling');
const { manilaToday, addDaysManila } = require('../utils/manilaDate');
const { isSunday } = require('../utils/businessDays');
const harness = require('./helpers/createBooking');

const { state, callPath, addBooking } = harness;

const COMPLETED_RECENTLY = () => new Date(Date.now() - 24 * 3600000);
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const repair = { _id: 'S-REP', name: 'Repair', serviceType: 'Repair', price: 900, isActive: true };

const completed = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Completed', completedAt: COMPLETED_RECENTLY(), date: '2026-09-01', time: 'Afternoon',
  address: 'Quezon City', contactNumber: '09171234567', units: [{ type: 'Split Type', quantity: 1 }], ...over,
});
const claim = (bookingId = 'CZ-1', as = 'CUS1') => callPath('POST', '/api/back-jobs', as, { bookingId, issueDescription: 'It leaks again' });
const withSunday = async (closed, fn) => {
  const before = scheduling.SUNDAY_CLOSED;
  scheduling.SUNDAY_CLOSED = closed;
  try { return await fn(); } finally { scheduling.SUNDAY_CLOSED = before; }
};

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [{ _id: 'CUS1', role: 'customer', isActive: true }, { _id: 'CUS2', role: 'customer', isActive: true }, { _id: 'ADM1', role: 'admin', isActive: true }],
  services: [cleaning, repair],
}));

const noteTypes = (user) => state.notes.filter((n) => n.user === user).map((n) => n.type);

test('a claim inside the warranty creates a free, unassigned, Pending visit and tells the customer once', async () => {
  completed();
  const res = await claim();
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.status, 'Scheduled');
  const visit = state.bookings.find((b) => b.isBackJob);
  assert.ok(visit, 'a visit was made');
  assert.equal(visit.status, 'Pending');
  assert.deepEqual(visit.assignments || [], [], 'unassigned: the admin assigns it');
  assert.equal(visit.technician, undefined);
  assert.equal(visit.downPaymentPercent, 0);
  assert.equal(visit.backJobId, state.backJobs[0].backJobId);
  assert.ok(visit.queueRank > 0, 'it joins the Pending queue');
  assert.deepEqual(noteTypes('CUS1'), ['backjob_received'], 'one notification to the customer');
  assert.match(state.notes.find((n) => n.user === 'CUS1').message, /covered by your warranty.*free/);
  assert.equal(state.notes.find((n) => n.user === 'CUS1').relatedBookingId, 'CZ-1');
});

test('the visit is two days after the claim in Manila, on a business day', async () => {
  completed();
  await claim();
  const visit = state.bookings.find((b) => b.isBackJob);
  const twoDays = addDaysManila(manilaToday(), 2);
  assert.ok(visit.date >= twoDays, `${visit.date} is not before ${twoDays}`);
  assert.equal(isSunday(visit.date), false, 'Sundays are closed');
  assert.ok(visit.date <= addDaysManila(twoDays, 1), 'at most one day moved');
  assert.equal(visit.time, 'Afternoon', 'the same time block as the original job');
});

test('a closure on that day moves the visit to the next open day', async () => {
  completed();
  const twoDays = addDaysManila(manilaToday(), 2);
  state.closures.push({ date: twoDays, reason: 'Holiday' });
  await claim();
  const visit = state.bookings.find((b) => b.isBackJob);
  assert.notEqual(visit.date, twoDays);
  assert.ok(visit.date > twoDays);
  assert.equal(isSunday(visit.date), false);
});

test('with Sundays open, a Sunday visit date is kept', async () => {
  await withSunday(false, async () => {
    const twoDays = addDaysManila(manilaToday(), 2);
    completed();
    await claim();
    assert.equal(state.bookings.find((b) => b.isBackJob).date, twoDays);
  });
});

test('a claim outside the warranty is Not Covered, makes no visit, and tells the customer it will be reviewed', async () => {
  completed({ completedAt: new Date('2025-01-01T00:00:00Z') });
  const res = await claim();
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.status, 'Not Covered');
  assert.equal(state.bookings.filter((b) => b.isBackJob).length, 0);
  assert.match(state.notes.find((n) => n.user === 'CUS1').message, /outside the warranty period.*review/);
});

test('a service with no warranty (a repair) is Not Covered, not an error', async () => {
  completed({ service: repair });
  assert.equal((await claim()).body.status, 'Not Covered');
});

test('a second claim on the same booking is refused', async () => {
  completed();
  assert.equal((await claim()).status, 201);
  const again = await claim();
  assert.equal(again.status, 400);
  assert.equal(again.body.message, 'A claim already exists for this booking.');
  assert.equal(state.backJobs.length, 1);
  assert.equal(state.bookings.filter((b) => b.isBackJob).length, 1, 'only one free visit');
});

test('two claims filed at the same moment: one wins, the other gets the same clear message, and no extra visit is left', async () => {
  completed();
  state.backJobDelay = 40;
  const results = await Promise.all([claim(), claim()]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 400]);
  const loser = results.find((r) => r.status === 400);
  assert.equal(loser.body.message, 'A claim already exists for this booking.');
  assert.equal(state.backJobs.length, 1);
  assert.equal(state.bookings.filter((b) => b.isBackJob).length, 1, 'the loser\'s visit was removed');
});

test('a closed (Reviewed) claim does not block a new one', async () => {
  completed();
  assert.equal((await claim()).status, 201);
  state.backJobs[0].status = 'Reviewed';
  state.backJobs[0].isOpen = false;
  assert.equal((await claim()).status, 201);
});

test('a free repair visit cannot itself be claimed against, and the message names the original booking', async () => {
  completed();
  await claim();
  const visit = state.bookings.find((b) => b.isBackJob);
  Object.assign(visit, { status: 'Completed', completedAt: COMPLETED_RECENTLY(), service: cleaning });
  const res = await claim(visit.bookingId);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /free repair visit.*Report it against booking CZ-1/);
});

test('only the owner can file a claim, and only on a completed booking', async () => {
  completed();
  assert.equal((await claim('CZ-1', 'CUS2')).status, 404);
  addBooking({ bookingId: 'CZ-2', customer: 'CUS1', service: cleaning, status: 'Approved' });
  assert.equal((await claim('CZ-2')).status, 400);
  assert.equal((await claim('CZ-NOPE')).status, 404);
  assert.equal(state.backJobs.length, 0);
});

test('when the admin reviews a Not Covered claim the customer is told and the claim closes', async () => {
  completed({ completedAt: new Date('2025-01-01T00:00:00Z') });
  await claim();
  state.notes.length = 0;
  const id = state.backJobs[0].backJobId;
  const BackJob = require('../models/BackJob');
  BackJob.findOne = async (f) => {
    const found = state.backJobs.find((b) => b.backJobId === f.backJobId);
    if (found) found.save = async () => found;
    return found;
  };
  const res = await callPath('PATCH', `/api/back-jobs/${id}/review`, 'ADM1', {}, { role: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(state.backJobs[0].status, 'Reviewed');
  assert.equal(state.backJobs[0].isOpen, false);
  assert.deepEqual(noteTypes('CUS1'), ['backjob_decided']);
  assert.match(state.notes[0].message, /not covered/);
});
