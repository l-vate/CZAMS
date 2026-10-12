// Run with: npm test (inside server/). The password must never appear in a response. The real routes
// and the real auth middleware run in a tiny Express app; only the database lookups are stubbed, so no
// database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const { hashPassword } = require('../utils/password');

const PLAIN = 'Correct-Horse-9';
let HASH;
const makeUser = (fields) => new User({ email: 'x@example.com', name: 'Test', phone: '0917', password: HASH, ...fields });

// What a Mongoose query gives back: awaitable, and chainable the way the routes chain it.
const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

let tech;
let admin;
let app;
let server;
let base;

test.before(async () => {
  HASH = await hashPassword(PLAIN);
  tech = makeUser({ _id: 'STF1001', role: 'staff', email: 'tech@example.com', position: 'Technician' });
  admin = makeUser({ _id: 'ADM1001', role: 'admin', email: 'admin@example.com' });
  const everyone = [tech, admin];

  User.findById = (id) => query(everyone.find((u) => u._id === id) || null);
  User.findOne = (filter) => query(everyone.find((u) => u.email === filter.email || u._id === filter._id) || null);
  User.find = (filter = {}) => query(everyone.filter((u) => !filter.role || u.role === filter.role));

  app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/users', require('../routes/userRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

const tokenFor = (user) => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '5m' });
const get = async (path, user) => {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${tokenFor(user)}` } });
  return { status: res.status, text: await res.text() };
};

// Every key name anywhere in a parsed response, however deep.
function allKeys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { found.add(k); allKeys(v, found); });
  return found;
}

const assertNoPassword = (text, label) => {
  assert.equal(allKeys(JSON.parse(text)).has('password'), false, `${label}: has a password key`);
  assert.equal(text.includes(HASH), false, `${label}: contains the stored hash`);
  assert.equal(text.includes('$2'), false, `${label}: contains a bcrypt hash`);
};

test('the model leaves the password out of toJSON and toObject, but the document still has it for login', () => {
  const user = makeUser({ _id: 'STF9' });
  assert.equal('password' in user.toObject(), false);
  assert.equal('password' in user.toJSON(), false);
  assert.equal(JSON.stringify(user).includes(HASH), false);
  assert.equal(user.password, HASH); // the login check still reads it
});

test('GET /api/users/me has no password', async () => {
  const res = await get('/api/users/me', tech);
  assert.equal(res.status, 200);
  assertNoPassword(res.text, '/me');
  assert.equal(JSON.parse(res.text).email, 'tech@example.com'); // and still returns the user
});

test('POST /api/auth/login has no password, with the right password', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'tech@example.com', password: PLAIN }),
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  assertNoPassword(text, 'login');
  assert.ok(JSON.parse(text).token);
});

test('the staff list (admin) has no password on any row', async () => {
  const res = await get('/api/users?role=staff', admin);
  assert.equal(res.status, 200);
  assertNoPassword(res.text, 'staff list');
  assert.equal(JSON.parse(res.text).length, 1);
});

test('a technician cannot read the staff list at all', async () => {
  const res = await get('/api/users?role=staff', tech);
  assert.equal(res.status, 403);
});
