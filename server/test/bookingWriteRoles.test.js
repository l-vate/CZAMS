// Run with: npm test (inside server/). The real routes and the real auth middleware run in a tiny Express app;
// only the database calls are stubbed, so no database is needed. Every booking write route against every role.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const { authCache } = require('../utils/authCache');
const { chain } = require('./helpers/memoryQueries');

const accounts = { ADM1: 'admin', CUS1: 'customer', STF1: 'staff' };
let server;
let base;

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.findOne = () => chain(null);
  // a customer's own routes look the booking up by id and owner; none exists here, so a request that gets past the
  // role check ends in a 404 (or a 400 from validation) and never reaches anything else
  Booking.findOne = () => chain(null);
  BackJob.findOne = () => chain(null);

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  app.use('/api/backjobs', require('../routes/backJobRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => authCache.clear());

const call = async (method, path, as, body = {}) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// [method, path, who may pass the role check]
const CUSTOMER_ONLY = [
  ['PATCH', '/api/bookings/CZ-1/cancel'],
  ['PATCH', '/api/bookings/CZ-1/pay'],
  ['PATCH', '/api/bookings/CZ-1/pay-balance'],
  ['PATCH', '/api/bookings/CZ-1/discount/request'],
  ['PATCH', '/api/bookings/CZ-1/reschedule'],
  ['PATCH', '/api/bookings/CZ-1/feedback'],
  ['PATCH', '/api/bookings/CZ-1/refund/received'],
  ['PATCH', '/api/bookings/CZ-1/refund/flag'],
  ['POST', '/api/backjobs'],
];
const ADMIN_ONLY_UPLOADS = [
  ['PATCH', '/api/bookings/CZ-1/unit-purchase-proof'],
  ['PATCH', '/api/bookings/CZ-1/refund'],
];

test('a technician cannot create a booking: 403', async () => {
  const res = await call('POST', '/api/bookings', 'STF1');
  assert.equal(res.status, 403);
  assert.equal(res.body.message, 'Forbidden');
});

test('a customer and an admin (walk-in) pass the role check on POST /api/bookings (they reach validation, a 400)', async () => {
  assert.equal((await call('POST', '/api/bookings', 'CUS1')).status, 400);
  assert.equal((await call('POST', '/api/bookings', 'ADM1')).status, 400);
});

CUSTOMER_ONLY.forEach(([method, path]) => {
  test(`${method} ${path}: a technician and an admin get 403, a customer gets past the role check`, async () => {
    assert.equal((await call(method, path, 'STF1')).status, 403, 'technician');
    assert.equal((await call(method, path, 'ADM1')).status, 403, 'admin');
    const customer = await call(method, path, 'CUS1');
    assert.notEqual(customer.status, 403, `customer was refused: ${JSON.stringify(customer.body)}`);
  });
});

ADMIN_ONLY_UPLOADS.forEach(([method, path]) => {
  test(`${method} ${path}: a technician and a customer get 403 before any file could be saved`, async () => {
    assert.equal((await call(method, path, 'STF1')).status, 403, 'technician');
    assert.equal((await call(method, path, 'CUS1')).status, 403, 'customer');
    assert.notEqual((await call(method, path, 'ADM1')).status, 403, 'admin');
  });
});

test('the technician actions still work for technicians (the guard did not touch them)', async () => {
  // not found booking = past the role stage; the route answers 404 instead of 403
  assert.equal((await call('PATCH', '/api/bookings/CZ-1/disruption/report', 'STF1', { reason: 'x' })).status, 404);
  assert.equal((await call('PATCH', '/api/bookings/CZ-1/extension/request', 'STF1', { reason: 'x' })).status, 404);
});

test('the admin routes are still admin only, as before', async () => {
  for (const [method, path, body] of [
    ['PATCH', '/api/bookings/CZ-1/assign', { assignments: [] }],
    ['PATCH', '/api/bookings/CZ-1/admin-update', { status: 'Approved' }],
    ['PATCH', '/api/bookings/CZ-1/extension/approve', {}],
    ['PATCH', '/api/bookings/CZ-1/disruption/reschedule', {}],
    ['PATCH', '/api/bookings/CZ-1/reschedule/approve', {}],
  ]) {
    assert.equal((await call(method, path, 'STF1', body)).status, 403, `technician ${path}`);
    assert.equal((await call(method, path, 'CUS1', body)).status, 403, `customer ${path}`);
  }
});
