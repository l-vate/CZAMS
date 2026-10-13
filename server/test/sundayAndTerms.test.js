// Run with: npm test (inside server/). (a) The Sunday switch: one rule (utils/businessDays.js) read by booking create,
// customer reschedule, reschedule approval, the disruption reschedule, extension days, the public calendar and
// auto-assign's suggested dates, tested with SUNDAY_CLOSED both on and off. (b) Payment terms: a customer cannot grant
// themselves a booking with no down payment; only a return customer (computed on the server) or a Commercial client
// whose terms an admin agreed may book without one. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const scheduling = require('../constants/scheduling');
const { isBusinessDay, nextBusinessDay, businessDayProblem, isSunday } = require('../utils/businessDays');
const { extensionSlotProblem, nextWorkingDayKey, addDays } = require('../utils/extensionDays');
const { findNextFreeDates } = require('../utils/autoAssign');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { readAgreedTerms } = require('../utils/profileFields');
const harness = require('./helpers/createBooking');

const { state, post, call } = harness;

const SUNDAY = (() => { let key = addDays(manilaTodayKey(), 8); while (!isSunday(key)) key = addDays(key, 1); return key; })();
const MONDAY = addDays(SUNDAY, 1);
const SATURDAY = addDays(SUNDAY, -1);

const withSunday = async (closed, fn) => {
  const before = scheduling.SUNDAY_CLOSED;
  scheduling.SUNDAY_CLOSED = closed;
  try { return await fn(); } finally { scheduling.SUNDAY_CLOSED = before; }
};

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
    { _id: 'COM1', role: 'customer', isActive: true, clientType: 'Commercial', name: 'Company', agreedPaymentTermsDays: null },
    { _id: 'COM2', role: 'customer', isActive: true, clientType: 'Commercial', name: 'Company Two', agreedPaymentTermsDays: 10 },
    { _id: 'RET1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Return One', manualClassification: 'Return' },
    { _id: 'ADM1', role: 'admin', isActive: true },
  ],
  services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
}));

// ---- (a) the rule on its own, in both modes
test('SUNDAY_CLOSED is on by default', () => {
  assert.equal(scheduling.SUNDAY_CLOSED, true);
});

test('with Sundays closed: Sunday is not a business day, nor is a closure date; the next business day skips both', async () => {
  await withSunday(true, async () => {
    assert.equal(isBusinessDay(SUNDAY), false);
    assert.equal(isBusinessDay(MONDAY), true);
    assert.equal(isBusinessDay(MONDAY, new Set([MONDAY])), false, 'a closure date');
    assert.equal(isBusinessDay('2026-02-31'), false, 'not a real date');
    assert.equal(nextBusinessDay(SATURDAY), MONDAY);
    assert.equal(nextBusinessDay(SATURDAY, new Set([MONDAY])), addDays(MONDAY, 1));
    assert.equal(nextBusinessDay(SUNDAY, new Set(), { inclusive: true }), MONDAY);
    assert.equal(nextBusinessDay(MONDAY, new Set(), { inclusive: true }), MONDAY);
    assert.match((await businessDayProblem({ findOne: () => ({ lean: async () => null }) }, SUNDAY)).message, /closed on Sundays/);
    assert.equal(await businessDayProblem({ findOne: () => ({ lean: async () => null }) }, MONDAY), null);
    assert.equal(nextWorkingDayKey(SATURDAY), MONDAY);
    assert.match(extensionSlotProblem({ date: SUNDAY, time: 'Morning' }, { date: SATURDAY, time: 'Afternoon' }, SATURDAY), /Sundays/);
    assert.deepEqual(findNextFreeDates({ minTechnicians: 1, technicians: [{ _id: 'T1' }], afterDateKey: SATURDAY, busyByDate: new Map(), limit: 2 }), [MONDAY, addDays(MONDAY, 1)]);
  });
});

test('with Sundays open: Sunday is an ordinary day everywhere', async () => {
  await withSunday(false, async () => {
    assert.equal(isBusinessDay(SUNDAY), true);
    assert.equal(nextBusinessDay(SATURDAY), SUNDAY);
    assert.equal(await businessDayProblem({ findOne: () => ({ lean: async () => null }) }, SUNDAY), null);
    assert.equal(nextWorkingDayKey(SATURDAY), SUNDAY);
    assert.equal(extensionSlotProblem({ date: SUNDAY, time: 'Morning' }, { date: SATURDAY, time: 'Afternoon' }, SATURDAY), null);
    assert.deepEqual(findNextFreeDates({ minTechnicians: 1, technicians: [{ _id: 'T1' }], afterDateKey: SATURDAY, busyByDate: new Map(), limit: 1 }), [SUNDAY]);
    assert.equal(isBusinessDay(SUNDAY, new Set([SUNDAY])), false, 'a closure date still closes it');
  });
});

// ---- (a) the routes
test('booking create: a Sunday is refused when closed, accepted when open', async () => {
  await withSunday(true, async () => {
    const res = await post({ date: SUNDAY });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /closed on Sundays/);
    assert.equal(state.bookings.length, 0);
    assert.equal((await post({ date: MONDAY })).status, 201);
  });
  await withSunday(false, async () => {
    assert.equal((await post({ date: SUNDAY })).status, 201);
  });
});

test('customer reschedule: a Sunday is refused when closed, accepted when open', async () => {
  const made = await post({ date: MONDAY });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = state.bookings[0].bookingId;
  await withSunday(true, async () => {
    const res = await call('PATCH', `/${id}/reschedule`, 'CUS1', { date: SUNDAY, time: 'Morning' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /closed on Sundays/);
  });
  await withSunday(false, async () => {
    const res = await call('PATCH', `/${id}/reschedule`, 'CUS1', { date: SUNDAY, time: 'Morning' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});

test('reschedule approval and the disruption reschedule refuse a Sunday when closed', async () => {
  await post({ date: MONDAY });
  const booking = state.bookings[0];
  const id = booking.bookingId;
  Object.assign(booking, { status: 'Approved', rescheduleRequest: { status: 'Pending', requestedDate: SUNDAY, requestedTime: 'Morning' }, assignments: [], extensionDays: [] });
  await withSunday(true, async () => {
    const approve = await call('PATCH', `/${id}/reschedule/approve`, 'ADM1', {}, { role: 'admin' });
    assert.equal(approve.status, 400, JSON.stringify(approve.body));
    assert.match(approve.body.message, /closed on Sundays/);
    const disruption = await call('PATCH', `/${id}/disruption/reschedule`, 'ADM1', { date: SUNDAY, time: 'Morning', reason: 'Storm' }, { role: 'admin' });
    assert.equal(disruption.status, 400, JSON.stringify(disruption.body));
    assert.match(disruption.body.message, /closed on Sundays/);
  });
  await withSunday(false, async () => {
    const disruption = await call('PATCH', `/${id}/disruption/reschedule`, 'ADM1', { date: SUNDAY, time: 'Morning', reason: 'Storm' }, { role: 'admin' });
    assert.equal(disruption.status, 200, JSON.stringify(disruption.body));
  });
});

test('the public calendar shows a Sunday as closed only when Sundays are closed', async () => {
  const { getAvailability } = require('../utils/availability');
  const User = require('../models/User');
  const Booking = require('../models/Booking');
  const Closure = require('../models/Closure');
  const { chain } = require('./helpers/memoryQueries');
  User.find = () => chain([]);
  Booking.find = () => chain([]);
  Closure.find = () => chain([]);
  const statusOf = async () => (await getAvailability(SUNDAY, SUNDAY))[0].status;
  await withSunday(true, async () => assert.equal(await statusOf(), 'closed'));
  await withSunday(false, async () => assert.notEqual(await statusOf(), 'closed'));
});

// ---- (b) payment terms
test('a customer cannot give themselves terms or a zero down payment', async () => {
  for (const fields of [
    { downPaymentPercent: 0 },
    { downPaymentPercent: 0, paymentTermsDays: 7 },
    { downPaymentPercent: 0, paymentTermsDays: 10, poNumber: 'PO-1' },
  ]) {
    const residential = await post(fields, 'CUS1');
    assert.equal(residential.status, 400, JSON.stringify(fields));
    assert.match(residential.body.message, /return customers or commercial clients on payment terms/);
    const unflagged = await post(fields, 'COM1');
    assert.equal(unflagged.status, 400, `unflagged commercial ${JSON.stringify(fields)}`);
  }
  assert.equal(state.bookings.length, 0);
});

test('a forged paymentTermsDays is ignored: the booking carries no terms for an unflagged commercial client', async () => {
  const res = await post({ downPaymentPercent: 50, paymentTermsDays: 7, poNumber: 'PO-77' }, 'COM1');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].paymentTermsDays, null);
  assert.equal(state.bookings[0].poNumber, 'PO-77', 'the PO number is welcome');
});

test('a commercial client whose terms an admin agreed may book without a down payment, and the booking carries those terms', async () => {
  const res = await post({ downPaymentPercent: 0, paymentTermsDays: 7 }, 'COM2');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].paymentTermsDays, 10, 'the account terms, not the 7 that was sent');
});

test('a return customer may book without a down payment, a regular one may not', async () => {
  assert.equal((await post({ downPaymentPercent: 0 }, 'RET1')).status, 201);
  assert.equal((await post({ downPaymentPercent: 0 }, 'CUS1')).status, 400);
});

test('an admin walk-in may give terms for a commercial client, 7 to 10 days only', async () => {
  const ok = await post({ downPaymentPercent: 0, paymentTermsDays: 8, customer: 'COM1' }, 'ADM1', { role: 'admin' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(state.bookings[0].paymentTermsDays, 8);
  const bad = await post({ downPaymentPercent: 0, paymentTermsDays: 30, customer: 'COM1' }, 'ADM1', { role: 'admin' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /7 and 10 days/);
});

test('the admin sets agreed terms: 7 to 10 days, empty clears them, only for a commercial customer', () => {
  const read = (body, who = { role: 'customer', clientType: 'Commercial' }) => readAgreedTerms({ ...who, body });
  assert.deepEqual(read({ agreedPaymentTermsDays: 7 }), { problem: null, value: 7 });
  assert.deepEqual(read({ agreedPaymentTermsDays: '10' }), { problem: null, value: 10 });
  assert.deepEqual(read({ agreedPaymentTermsDays: '' }), { problem: null, value: null });
  assert.deepEqual(read({}), { problem: null, value: undefined });
  [6, 11, 7.5, 'abc'].forEach((v) => assert.equal(read({ agreedPaymentTermsDays: v }).problem.status, 400, String(v)));
  assert.deepEqual(read({ agreedPaymentTermsDays: 7 }, { role: 'customer', clientType: 'Residential' }), { problem: null, value: null }, 'a residential customer has none');
  assert.equal(read({ agreedPaymentTermsDays: 7 }, { role: 'staff' }).problem.status, 400);
});
