// Run with: npm test (inside server/). The real auth middleware and the real change-password route run in
// a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const { authCache } = require('../utils/authCache');
const { hashPassword } = require('../utils/password');
const { validateNewPassword } = require('../utils/passwordRules');

// ---- the rules on their own
test('a new password is required, a string, and at least 8 characters', () => {
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1' }).message, /required/);
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: '' }).message, /required/);
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: 12345678 }).message, /required/);
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: { $ne: '' } }).message, /required/);
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: 'short' }).message, /at least 8 characters/);
  assert.equal(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: '1234567' }).status, 400);
});

test('it must differ from the current password', () => {
  assert.match(validateNewPassword({ currentPassword: 'samepassword', newPassword: 'samepassword' }).message, /different/);
});

test('a good password passes', () => {
  assert.equal(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: 'a-better-one-9' }), null);
  assert.equal(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: '12345678' }), null); // exactly 8
});

// ---- through the real route
const OLD = 'old-password-1';
let user;
let saves;
let server;
let base;

const query = (value) => ({
  select() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

test.before(async () => {
  User.findById = () => query(user);
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test.beforeEach(async () => {
  authCache.clear();
  saves = 0;
  user = new User({ _id: 'STF1', role: 'staff', email: 'tech@example.com', name: 'Tech', password: await hashPassword(OLD) });
  user.save = async () => { saves += 1; return user; };
});

const change = async (body) => {
  const token = jwt.sign({ id: 'STF1', role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/auth/change-password`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test('a missing, empty, short, non-text or unchanged new password is a 400, never a 500', async () => {
  const cases = [
    [{ currentPassword: OLD }, /required/],
    [{ currentPassword: OLD, newPassword: '' }, /required/],
    [{ currentPassword: OLD, newPassword: 'short' }, /at least 8/],
    [{ currentPassword: OLD, newPassword: 123456789 }, /required/],
    [{ currentPassword: OLD, newPassword: OLD }, /different/],
  ];
  for (const [body, message] of cases) {
    const res = await change(body);
    assert.equal(res.status, 400, JSON.stringify(Object.keys(body)));
    assert.match(res.body.message, message);
  }
  assert.equal(saves, 0, 'nothing may be saved for a rejected password');
});

test('a wrong current password is a 400 and saves nothing', async () => {
  const res = await change({ currentPassword: 'not-my-password', newPassword: 'a-better-one-9' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Current password is incorrect/);
  assert.equal(saves, 0);
});

test('a missing current password is a 400, not a 500', async () => {
  const res = await change({ newPassword: 'a-better-one-9' });
  assert.equal(res.status, 400);
});

test('a good change is saved as a bcrypt hash, never as the plain password', async () => {
  const res = await change({ currentPassword: OLD, newPassword: 'a-better-one-9' });
  assert.equal(res.status, 200);
  assert.equal(saves, 1);
  assert.notEqual(user.password, 'a-better-one-9');
  assert.equal(await bcrypt.compare('a-better-one-9', user.password), true);
  assert.equal(JSON.stringify(res.body).includes('a-better-one-9'), false);
});
