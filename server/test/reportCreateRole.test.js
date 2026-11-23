// Run with: npm test (inside server/). Filing a service report is for technicians (staff accounts) only: a customer or an admin is refused
// with 403 before any upload is read. The real route and auth middleware run; only the user lookup is stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const { authCache } = require('../utils/authCache');
const { chain } = require('./helpers/memoryQueries');

const accounts = { ADM1: 'admin', CUS1: 'customer', STF1: 'staff' };
let server;
let base;

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  Booking.findOne = () => chain(null);
  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(() => authCache.clear());

const post = async (as) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}' });
  return res.status;
};

test('a customer and an admin get 403 on POST /api/reports', async () => {
  assert.equal(await post('CUS1'), 403);
  assert.equal(await post('ADM1'), 403);
});

test('a staff account passes the role check (it then fails validation, not authorization)', async () => {
  assert.equal(await post('STF1'), 400);
});
