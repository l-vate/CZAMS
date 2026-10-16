// Run with: npm test (inside server/). The real delete route and the real auth middleware run in a tiny Express
// app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const { authCache } = require('../utils/authCache');
const { describeBlockers } = require('../utils/deletionBlockers');
const { matches } = require('./helpers/memoryQueries');

let bookings;
let backJobs;
let deleted;
let server;
let base;

test.before(async () => {
  User.findById = (id) => ({ select() { return this; }, then(res, rej) { return Promise.resolve({ _id: id, role: 'customer', isActive: true }).then(res, rej); } });
  User.findByIdAndDelete = async (id) => { deleted.push(id); return { _id: id }; };
  Booking.countDocuments = async (filter) => bookings.filter((b) => matches(b, filter)).length;
  BackJob.countDocuments = async (filter) => backJobs.filter((b) => matches(b, filter)).length;

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); bookings = []; backJobs = []; deleted = []; });

const remove = async () => {
  const token = jwt.sign({ id: 'CUS1', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/auth/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
};
const booking = (over) => ({ customer: 'CUS1', status: 'Completed', refund: { status: 'None' }, ...over });

// ---- the sentence
test('the message names what is open, in plain words, with the right singular and plural', () => {
  assert.equal(describeBlockers({}), null);
  assert.match(describeBlockers({ activeBookings: 1 }), /1 booking that is still Pending, Approved or In Progress/);
  assert.match(describeBlockers({ activeBookings: 3 }), /3 bookings that are still Pending, Approved or In Progress/);
  assert.match(describeBlockers({ openRefunds: 1 }), /1 refund that is not settled yet/);
  assert.match(describeBlockers({ openBackJobs: 2 }), /2 back job claims that are waiting for review/);
  const all = describeBlockers({ activeBookings: 1, openRefunds: 1, openBackJobs: 1 });
  assert.match(all, /^Your account cannot be deleted yet\./);
  assert.match(all, /Cancel or finish them first, then try again\.$/);
});

// ---- the route
test('a customer with no open items can delete their account (only the user is deleted)', async () => {
  const res = await remove();
  assert.equal(res.status, 200);
  assert.deepEqual(deleted, ['CUS1']);
});

test('completed and cancelled bookings alone do not block the deletion', async () => {
  bookings = [booking({ status: 'Completed' }), booking({ status: 'Cancelled' })];
  assert.equal((await remove()).status, 200);
  assert.deepEqual(deleted, ['CUS1']);
});

['Pending', 'Approved', 'In Progress'].forEach((status) => {
  test(`a ${status} booking blocks the deletion with a clear 400, and nothing is deleted`, async () => {
    bookings = [booking({ status })];
    const res = await remove();
    assert.equal(res.status, 400);
    assert.match(res.body.message, /cannot be deleted yet/);
    assert.match(res.body.message, /1 booking that is still Pending, Approved or In Progress/);
    assert.deepEqual(deleted, []);
  });
});

test('an unsettled refund blocks it, even on a cancelled booking', async () => {
  bookings = [booking({ status: 'Cancelled', refund: { status: 'Pending' } })];
  const res = await remove();
  assert.equal(res.status, 400);
  assert.match(res.body.message, /1 refund that is not settled yet/);
  assert.deepEqual(deleted, []);
});

test('a refund the customer flagged and nobody has resolved blocks it; a resolved flag does not', async () => {
  bookings = [booking({ status: 'Cancelled', refund: { status: 'Processed', customerFlag: { flagged: true, resolved: false } } })];
  assert.equal((await remove()).status, 400);
  bookings = [booking({ status: 'Cancelled', refund: { status: 'Processed', customerFlag: { flagged: true, resolved: true } } })];
  assert.equal((await remove()).status, 200);
});

test('a back job claim waiting for review blocks it; a reviewed one does not', async () => {
  backJobs = [{ customer: 'CUS1', status: 'Not Covered' }];
  const res = await remove();
  assert.equal(res.status, 400);
  assert.match(res.body.message, /1 back job claim that is waiting for review/);
  backJobs = [{ customer: 'CUS1', status: 'Reviewed' }];
  assert.equal((await remove()).status, 200);
});

test('a scheduled free repair visit blocks only through its own active booking, not twice', async () => {
  backJobs = [{ customer: 'CUS1', status: 'Scheduled' }];
  bookings = [booking({ status: 'Pending', isBackJob: true })];
  const res = await remove();
  assert.equal(res.status, 400);
  assert.match(res.body.message, /1 booking that is still/);
  assert.equal(/back job claim/.test(res.body.message), false);
  bookings = [booking({ status: 'Completed', isBackJob: true })]; // the visit is done: nothing is open any more
  assert.equal((await remove()).status, 200);
});

test('several open things are all named in one message', async () => {
  bookings = [booking({ status: 'Pending' }), booking({ status: 'Approved' }), booking({ status: 'Cancelled', refund: { status: 'Pending' } })];
  backJobs = [{ customer: 'CUS1', status: 'Not Covered' }];
  const res = await remove();
  assert.equal(res.status, 400);
  assert.match(res.body.message, /2 bookings that are still Pending, Approved or In Progress, 1 refund that is not settled yet, 1 back job claim that is waiting for review/);
  assert.deepEqual(res.body.blockers, { activeBookings: 2, openRefunds: 1, openBackJobs: 1 });
});

test('another customer\'s open items do not block this one', async () => {
  bookings = [booking({ customer: 'CUS2', status: 'Pending' })];
  backJobs = [{ customer: 'CUS2', status: 'Not Covered' }];
  assert.equal((await remove()).status, 200);
});
