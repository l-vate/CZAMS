// Run with: npm test (inside server/). The real auth middleware and the real change-password route run in a tiny
// Express app; only the database calls are stubbed, so no database is needed.
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
const NEW = 'a-better-one-9';
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
const change = async (token, body) => {
  const res = await fetch(`${base}/api/auth/change-password`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
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

test('changing the password sets the time, returns a fresh token, and that token works at once', async () => {
  const old = tokenIssuedAt(nowSeconds() - 30);
  assert.equal((await who(old)).status, 200);

  const res = await change(old, { currentPassword: OLD, newPassword: NEW });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(user.passwordChangedAt instanceof Date);
  assert.ok(res.body.token, 'a fresh token is returned');
  assert.equal(JSON.stringify(res.body).includes(NEW), false);

  assert.equal((await who(res.body.token)).status, 200, 'the token from the change itself stays valid');
});

test('after a change the old token is refused on the very next request, with no wait for the cache', async () => {
  const old = tokenIssuedAt(nowSeconds() - 30);
  assert.equal((await who(old)).status, 200); // now cached as "no change yet"
  await change(old, { currentPassword: OLD, newPassword: NEW });
  const res = await who(old);
  assert.equal(res.status, 401);
  assert.match(res.body.message, /password was changed/i);
});

test('another device\'s older token is also refused after the change', async () => {
  const thisDevice = tokenIssuedAt(nowSeconds() - 10);
  const otherDevice = tokenIssuedAt(nowSeconds() - 5000);
  const res = await change(thisDevice, { currentPassword: OLD, newPassword: NEW });
  assert.equal(res.status, 200);
  assert.equal((await who(otherDevice)).status, 401);
  assert.equal((await who(res.body.token)).status, 200);
});

test('a rejected change (wrong current password) does not sign anyone out', async () => {
  const old = tokenIssuedAt(nowSeconds() - 30);
  const res = await change(old, { currentPassword: 'wrong-one-123', newPassword: NEW });
  assert.equal(res.status, 400);
  assert.equal(user.passwordChangedAt, undefined);
  assert.equal((await who(old)).status, 200);
});

test('logging in again after a change gives a token that works', async () => {
  user.passwordChangedAt = new Date(Date.now() - 5000);
  const fresh = jwt.sign({ id: 'STF1', role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '1d' });
  assert.equal((await who(fresh)).status, 200);
});
