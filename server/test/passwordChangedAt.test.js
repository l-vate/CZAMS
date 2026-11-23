// Run with: npm test (inside server/). The real auth middleware runs in a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const { authCache } = require('../utils/authCache');
const { hashPassword } = require('../utils/password');
const { chain } = require('./helpers/memoryQueries');

const OLD = 'old-password-1';
let user;
let server;
let base;

test.before(async () => {
  User.findById = () => chain(user);
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.get('/whoami', require('../middleware/auth'), (req, res) => res.json({ id: req.userId }));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test.beforeEach(async () => {
  authCache.clear();
  user = new User({ _id: 'STF1', role: 'staff', email: 'tech@example.com', name: 'Tech', password: await hashPassword(OLD) });
  user.save = async () => user;
});

const nowSeconds = () => Math.floor(Date.now() / 1000);
const tokenIssuedAt = (iat) => jwt.sign({ id: 'STF1', role: 'staff', iat }, process.env.JWT_SECRET, { expiresIn: '1d' });
const who = async (token) => {
  const res = await fetch(`${base}/whoami`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
};
test('an account that never changed its password is unaffected: old tokens keep working', async () => {
  assert.equal(user.passwordChangedAt, undefined);
  assert.equal((await who(tokenIssuedAt(nowSeconds() - 3600))).status, 200);
});

test('a token issued before the password change is refused with 401', async () => {
  user.passwordChangedAt = new Date();
  const res = await who(tokenIssuedAt(nowSeconds() - 60));
  assert.equal(res.status, 401);
  assert.match(res.body.message, /password was changed/i);
});

test('a token issued after the change works', async () => {
  user.passwordChangedAt = new Date(Date.now() - 120000);
  assert.equal((await who(tokenIssuedAt(nowSeconds() - 60))).status, 200);
  assert.equal((await who(tokenIssuedAt(nowSeconds()))).status, 200);
});

test('a token issued in the same second as the change works (the fresh token from the change itself)', async () => {
  const when = new Date();
  user.passwordChangedAt = when;
  assert.equal((await who(tokenIssuedAt(Math.floor(when.getTime() / 1000)))).status, 200);
  assert.equal((await who(tokenIssuedAt(Math.floor(when.getTime() / 1000) - 1))).status, 401);
});

test('logging in again after a change gives a token that works', async () => {
  user.passwordChangedAt = new Date(Date.now() - 5000);
  const fresh = jwt.sign({ id: 'STF1', role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '1d' });
  assert.equal((await who(fresh)).status, 200);
});
