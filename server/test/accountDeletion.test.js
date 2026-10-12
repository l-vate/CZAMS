// Run with: npm test (inside server/). The real auth middleware and the real delete route run in a tiny
// Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const { authCache } = require('../utils/authCache');

const accounts = {
  STF1: { role: 'staff', isActive: true },
  ADM1: { role: 'admin', isActive: true },
  CUS1: { role: 'customer', isActive: true },
};
let deleted = [];

const query = (value) => ({
  select() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

let server;
let base;

test.before(async () => {
  User.findById = (id) => query(accounts[id] || null);
  User.findByIdAndDelete = async (id) => {
    deleted.push(id);
    return accounts[id] || null;
  };
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { deleted = []; authCache.clear(); });

const remove = async (id) => {
  const token = jwt.sign({ id, role: accounts[id].role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/auth/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
};

test('a technician cannot delete their account: 403 and nothing is deleted', async () => {
  const res = await remove('STF1');
  assert.equal(res.status, 403);
  assert.match(res.body.message, /Only customers/);
  assert.deepEqual(deleted, []);
});

test('an admin cannot delete their account through this route either', async () => {
  const res = await remove('ADM1');
  assert.equal(res.status, 403);
  assert.deepEqual(deleted, []);
});

test('a customer can still delete their own account', async () => {
  const res = await remove('CUS1');
  assert.equal(res.status, 200);
  assert.deepEqual(deleted, ['CUS1']);
});
