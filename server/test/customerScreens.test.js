// Run with: npm test (inside server/). The customer screen fixes: a Sunday is refused by the date picker's rule (kept in step with the
// server's switch), the same-day cancellation warning and its wording, the booking page heading for each status, a Pending refund cannot
// be flagged, and no claim on a booking is a normal 200 answer. The client files are plain functions, loaded on their own.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const scheduling = require('../constants/scheduling');
const { isBusinessDay: serverIsBusinessDay } = require('../utils/businessDays');
const User = require('../models/User');
const BackJob = require('../models/BackJob');
const { authCache } = require('../utils/authCache');
const harness = require('./helpers/createBooking');
const { chain } = require('./helpers/memoryQueries');

const load = (file) => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', file)).href);

// ---- Sunday
test('the date picker and the server agree on Sundays: both closed, and the client switch matches the server switch', async () => {
  const client = await load('utils/businessDays.js');
  assert.equal(client.SUNDAY_CLOSED, scheduling.SUNDAY_CLOSED, 'src/utils/businessDays.js and server/constants/scheduling.js must be changed together');
  const sunday = '2026-11-01';
  const monday = '2026-11-02';
  assert.equal(client.isSundayKey(sunday), true);
  assert.equal(client.isSundayKey(monday), false);
  assert.equal(client.isBusinessDay(sunday), serverIsBusinessDay(sunday));
  assert.equal(client.isBusinessDay(monday), serverIsBusinessDay(monday));
  const closed = new Set([monday]);
  assert.equal(client.isBusinessDay(monday, closed), serverIsBusinessDay(monday, closed));
  assert.equal(client.sundayProblem(sunday), 'The shop is closed on Sundays. Choose another day.');
  assert.equal(client.sundayProblem(monday), null);
  assert.equal(client.sundayProblem(sunday, { sundayClosed: false }), null, 'with Sundays open the date is fine');
  assert.equal(client.isBusinessDay(sunday, new Set(), { sundayClosed: false }), true);
  assert.equal(client.sundayProblem(''), null);
  assert.equal(client.sundayProblem('not a date'), null);
});

// ---- same-day cancellation wording
test('the same-day warning uses the same rule as the confirmation, and shows only when it applies', async () => {
  const c = await load('config/cancellation.js');
  assert.ok(c.SAME_DAY_CANCEL_WARNING.includes(c.SAME_DAY_DEDUCTION_CLAUSE));
  assert.ok(c.sameDayCancelledMessage('₱300').includes(c.SAME_DAY_DEDUCTION_CLAUSE.replace('your down payment', 'your down payment of ₱300')));
  assert.match(c.sameDayCancelledMessage('₱300'), /down payment of ₱300 before it's refunded\.$/);
  const today = '2026-10-14';
  assert.equal(c.showsSameDayWarning({ date: today, paymentStatus: 'partially_paid' }, today), true);
  assert.equal(c.showsSameDayWarning({ date: today, paymentStatus: 'to_verify' }, today), true);
  assert.equal(c.showsSameDayWarning({ date: today, paymentStatus: 'Unpaid' }, today), false, 'nothing paid, nothing to deduct from');
  assert.equal(c.showsSameDayWarning({ date: '2026-10-20', paymentStatus: 'partially_paid' }, today), false, 'another day');
  assert.equal(c.showsSameDayWarning(null, today), false);
});

// ---- heading
test('the booking page heading matches the status', async () => {
  const { bookingHeading } = await load('utils/bookingHeading.js');
  assert.equal(bookingHeading('Pending'), 'Booking Request Submitted!');
  assert.equal(bookingHeading('Approved'), 'Booking Confirmed');
  assert.equal(bookingHeading('In Progress'), 'Service In Progress');
  assert.equal(bookingHeading('Completed'), 'Service Completed');
  ['Completed', 'Approved', 'In Progress'].forEach((status) => assert.notEqual(bookingHeading(status), 'Booking Request Submitted!', status));
  assert.equal(bookingHeading(undefined), 'Booking Details');
});

// ---- the refund flag
test.describe('flagging a refund', () => {
  test.before(() => harness.install());
  test.after(() => harness.close());
  test.beforeEach(() => harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer' }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }],
    services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true }],
  }));
  const cancelled = (refund) => harness.addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: harness.state.services[0], status: 'Cancelled', units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 50, refund });
  const flag = () => harness.call('PATCH', '/CZ-1/refund/flag', 'CUS1', { message: 'Still waiting for my money' });

  test('a refund that is still Pending cannot be flagged, with a clear message', async () => {
    const b = cancelled({ status: 'Pending', downPaymentAmount: 500 });
    const res = await flag();
    assert.equal(res.status, 400);
    assert.match(res.body.message, /has not been sent yet/);
    assert.equal(b.refund.customerFlag, undefined, 'nothing was saved');
    assert.equal(harness.state.notes.filter((n) => n.type === 'refund_flagged').length, 0, 'no admin was told');
  });

  test('a processed refund can be flagged, and a booking with no refund cannot', async () => {
    cancelled({ status: 'Processed', downPaymentAmount: 500 });
    assert.equal((await flag()).status, 200);
    harness.reset({ users: harness.state.users, services: harness.state.services });
    cancelled({ status: 'None' });
    const none = await flag();
    assert.equal(none.status, 400);
    assert.match(none.body.message, /no refund on this booking/);
  });
});

// ---- no claim is a normal answer
test.describe('the back job claim on a booking', () => {
  let server;
  let base;
  let claims;
  test.before(async () => {
    User.findById = (id) => chain({ _id: id, role: id.startsWith('ADM') ? 'admin' : 'customer', isActive: true });
    BackJob.findOne = () => chain(claims[0] || null);
    const app = express();
    app.use(express.json());
    app.use('/api/backjobs', require('../routes/backJobRoutes'));
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.after(() => server && server.close());
  test.beforeEach(() => { authCache.clear(); claims = []; });
  const get = async (as) => {
    const token = jwt.sign({ id: as, role: as.startsWith('ADM') ? 'admin' : 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const res = await fetch(`${base}/api/backjobs/booking/CZ-1`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json() };
  };

  test('no claim: 200 with null, for the customer and for an admin', async () => {
    assert.deepEqual(await get('CUS1'), { status: 200, body: null });
    assert.deepEqual(await get('ADM1'), { status: 200, body: null });
  });

  test('a claim that belongs to someone else is still refused, and the owner still gets it', async () => {
    claims = [{ backJobId: 'BJ-1', customer: 'CUS2', originalBookingId: 'CZ-1', issueDescription: 'x', status: 'Scheduled', toObject() { return { ...this }; } }];
    assert.equal((await get('CUS1')).status, 403);
    claims[0].customer = 'CUS1';
    assert.equal((await get('CUS1')).status, 200);
  });
});
