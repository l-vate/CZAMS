// Run with: npm test (inside server/). The real auth middleware and the real routes run in a tiny Express
// app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const TechnicianOff = require('../models/TechnicianOff');
const PaymentSettings = require('../models/PaymentSettings');
const { authCache } = require('../utils/authCache');

const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

const accounts = {
  STF1: { role: 'staff', isActive: true },
  CUS1: { role: 'customer', isActive: true },
  ADM1: { role: 'admin', isActive: true },
};
const TECHNICIANS = [{ _id: 'STF1', name: 'Tech One', position: 'Technician' }, { _id: 'STF2', name: 'Tech Two', position: 'Technician' }];
const SETTINGS = { _id: 'default', paymentMethods: [{ name: 'GCash', accountDetails: [{ label: 'Number', value: '09171234567' }] }], downPaymentPercentages: [50], seniorPwdDiscountPercent: 20 };

let server;
let base;

test.before(async () => {
  User.findById = (id) => query(accounts[id] || null);
  User.find = () => query(TECHNICIANS);
  Booking.find = () => Promise.resolve([]);
  TechnicianOff.find = () => ({ select: () => ({ lean: async () => [] }) });
  PaymentSettings.findById = () => Promise.resolve(SETTINGS);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  app.use('/api/payment-settings', require('../routes/paymentSettingsRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => authCache.clear());

const call = async (path, id) => {
  const headers = id ? { Authorization: `Bearer ${jwt.sign({ id, role: accounts[id].role }, process.env.JWT_SECRET, { expiresIn: '5m' })}` } : {};
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, body: await res.json() };
};

// ---- N1
test('the technicians list for a visitor with no login has names only: no ids, no positions', async () => {
  const res = await call('/api/auth/technicians');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [{ name: 'Tech One' }, { name: 'Tech Two' }]);
  assert.equal(JSON.stringify(res.body).includes('STF1'), false);
});

test('a bad token is treated like no login', async () => {
  const res = await fetch(`${base}/api/auth/technicians`, { headers: { Authorization: 'Bearer not.a.token' } });
  assert.deepEqual(await res.json(), [{ name: 'Tech One' }, { name: 'Tech Two' }]);
});

test('a signed-in customer still gets ids and positions, so the booking form keeps working', async () => {
  const res = await call('/api/auth/technicians', 'CUS1');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body[0], { _id: 'STF1', name: 'Tech One', position: 'Technician' });
});

// ---- N2
test('the busy list: a technician is refused, a customer and an admin still get it', async () => {
  assert.equal((await call('/api/bookings/busy-technicians?date=2026-10-20&time=Morning', 'STF1')).status, 403);
  const customer = await call('/api/bookings/busy-technicians?date=2026-10-20&time=Morning', 'CUS1');
  assert.equal(customer.status, 200);
  assert.deepEqual(customer.body, { busyTechIds: [] });
  assert.equal((await call('/api/bookings/busy-technicians?date=2026-10-20&time=Morning', 'ADM1')).status, 200);
});

test('the busy list still needs a login', async () => {
  assert.equal((await call('/api/bookings/busy-technicians?date=2026-10-20&time=Morning')).status, 401);
});

// ---- N9
test('payment settings (the company account details): a technician is refused, a customer and an admin get them', async () => {
  const tech = await call('/api/payment-settings', 'STF1');
  assert.equal(tech.status, 403);
  assert.equal(JSON.stringify(tech.body).includes('09171234567'), false);
  const customer = await call('/api/payment-settings', 'CUS1');
  assert.equal(customer.status, 200);
  assert.equal(customer.body.paymentMethods[0].accountDetails[0].value, '09171234567');
  assert.equal((await call('/api/payment-settings', 'ADM1')).status, 200);
});
