// Run with: npm test (inside server/). Registration and profile input is checked on the server: names, a real email
// (stored lower case and found without regard to case, including accounts saved with capitals), a contact number, and a
// password of at least 8 characters. A database refusal caused by what the person sent is a 400 that names the field,
// never a 500 "Server error". The real routes run in a tiny Express app; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const { authCache } = require('../utils/authCache');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');
const { validateRegistration, validateProfileUpdate, normalizeEmail } = require('../utils/accountInput');
const { sendRouteError, describeValidationError } = require('../utils/routeErrors');
const { hashPassword } = require('../utils/password');
const { chain } = require('./helpers/memoryQueries');
const harness = require('./helpers/createBooking');

const GOOD = { firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com', phone: '0917 123 4567', password: 'longenough1!' };

// ---- the rules on their own
test('a good registration passes', () => {
  assert.equal(validateRegistration(GOOD), null);
});

test('each bad registration field gets its own message', () => {
  const msg = (over) => validateRegistration({ ...GOOD, ...over }).message;
  assert.match(msg({ firstName: '' }), /First name is required/);
  assert.match(msg({ firstName: '   ' }), /First name is required/);
  assert.match(msg({ lastName: undefined }), /Last name is required/);
  assert.match(msg({ firstName: 'x'.repeat(51) }), /50 characters/);
  assert.match(msg({ email: '' }), /Email is required/);
  ['not-an-email', 'a@b', 'a b@c.com', '@x.com'].forEach((email) => assert.match(msg({ email }), /valid email/, email));
  assert.match(msg({ phone: '' }), /contact number is required/);
  assert.match(msg({ phone: 'abc' }), /valid contact number/);
  assert.match(msg({ phone: '12345' }), /valid contact number/);
  assert.match(msg({ password: 'short' }), /at least 8 characters/);
  assert.match(msg({ password: undefined }), /password is required/i);
  assert.match(msg({ password: '' }), /password is required/i);
});

test('a profile needs names and an email, and a phone number only has to be valid when given', () => {
  assert.equal(validateProfileUpdate({ firstName: 'A', lastName: 'B', email: 'a@b.co' }), null);
  assert.equal(validateProfileUpdate({ firstName: 'A', lastName: 'B', email: 'a@b.co', phone: '' }), null);
  assert.match(validateProfileUpdate({ firstName: 'A', lastName: undefined, email: 'a@b.co' }).message, /Last name/);
  assert.match(validateProfileUpdate({ firstName: 'A', lastName: 'B', email: 'a@b.co', phone: 'nope' }).message, /contact number/);
});

test('the email is stored trimmed and lower case', () => {
  assert.equal(normalizeEmail('  Ana@Example.COM '), 'ana@example.com');
});

// ---- the database refusals
test('a Mongoose validation error is a 400 that names the field', async () => {
  const err = new Booking({ bookingId: 'CZ-1' }).validateSync();
  let sent;
  const res = { status(code) { sent = { code }; return this; }, json(body) { sent.body = body; return this; } };
  sendRouteError(res, err);
  assert.equal(sent.code, 400);
  assert.match(sent.body.message, /Address is required\./);
  assert.match(describeValidationError(err), /Customer is required\./);
});

test('a cast error is a 400, and anything else is a logged 500', () => {
  let sent;
  const res = { status(code) { sent = { code }; return this; }, json(body) { sent.body = body; return this; } };
  sendRouteError(res, new mongoose.Error.CastError('ObjectId', 'x', 'service'));
  assert.equal(sent.code, 400);
  assert.match(sent.body.message, /Service is not valid/);
  const logged = [];
  sendRouteError(res, new Error('db down'), (e) => logged.push(e.message));
  assert.equal(sent.code, 500);
  assert.equal(sent.body.message, 'Server error');
  assert.deepEqual(logged, ['db down']);
});

// ---- through the real routes
let users;
let server;
let base;

test.before(async () => {
  User.findOne = (f) => chain(users.find((u) => {
    if (f.email instanceof RegExp && !f.email.test(u.email)) return false;
    if (f._id && f._id.$ne && u._id === f._id.$ne) return false;
    return true;
  }) || null);
  User.findById = (id) => chain(users.find((u) => u._id === id) || null);
  User.create = async (data) => { const u = { ...data, save: async () => u }; users.push(u); return u; };

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(async () => {
  authCache.clear();
  loginLimiter.reset();
  registerLimiter.reset();
  users = [{
    _id: 'CUS7', name: 'Old Name', email: 'Bea@Example.com', phone: '09170000000', role: 'customer', isActive: true, password: await hashPassword('rightpass1'),
    save: async function save() { return this; },
  }];
});

const send = async (method, path, body, token) => {
  const res = await fetch(`${base}/api/auth${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('register: a good account is created with a lower case email and a trimmed name', async () => {
  const res = await send('POST', '/register', { ...GOOD, email: '  Ana@Example.COM ', firstName: ' Ana ', lastName: ' Cruz ' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const saved = users[users.length - 1];
  assert.equal(saved.email, 'ana@example.com');
  assert.equal(saved.name, 'Ana Cruz');
  assert.notEqual(saved.password, GOOD.password, 'stored hashed');
});

test('register: every bad field is a 400 with a clear message and nothing is created', async () => {
  for (const over of [{ password: 'short' }, { password: undefined }, { email: 'nope' }, { lastName: '' }, { firstName: undefined }, { phone: 'abc' }]) {
    const res = await send('POST', '/register', { ...GOOD, ...over });
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.ok(res.body.message.length > 5);
  }
  assert.equal(users.length, 1);
});

test('register: an email that differs only in letter case is already registered, including an account saved with capitals', async () => {
  const res = await send('POST', '/register', { ...GOOD, email: 'BEA@example.COM' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /already registered/);
});

test('login finds an account saved with a mixed-case email, whatever case is typed', async () => {
  for (const email of ['Bea@Example.com', 'bea@example.com', 'BEA@EXAMPLE.COM']) {
    const res = await send('POST', '/login', { email, password: 'rightpass1' });
    assert.equal(res.status, 200, email);
  }
  assert.equal((await send('POST', '/login', { email: 'bea@example.com', password: 'wrong' })).status, 401);
  assert.equal((await send('POST', '/login', { email: undefined, password: 'x' })).status, 401);
  assert.equal((await send('POST', '/login', { email: { $ne: '' }, password: 'x' })).status, 401, 'an object is not an email');
});

test('profile: a missing last name is a 400 and the name is never saved as "undefined undefined"', async () => {
  const token = jwt.sign({ id: 'CUS7', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  users[0].role = 'customer';
  const res = await send('PUT', '/profile', { firstName: 'Bea', email: 'bea@example.com' }, token);
  assert.equal(res.status, 400);
  assert.equal(users[0].name, 'Old Name');
  const ok = await send('PUT', '/profile', { firstName: ' Bea ', lastName: ' Lim ', email: 'Bea@Example.com', phone: '', address: ' Makati ' }, token);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(users[0].name, 'Bea Lim');
  assert.equal(users[0].email, 'Bea@Example.com', 'an email that only differs in case is left as it is');
  assert.equal(users[0].phone, '09170000000', 'a blank phone keeps the saved one');
  assert.equal(users[0].address, 'Makati');
});

test('profile: changing to an email another account has (in any letter case) is refused', async () => {
  users.push({ _id: 'CUS8', name: 'Other', email: 'taken@example.com', role: 'customer', isActive: true, save: async () => {} });
  const token = jwt.sign({ id: 'CUS7', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await send('PUT', '/profile', { firstName: 'Bea', lastName: 'Lim', email: 'TAKEN@example.com' }, token);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /already in use/);
});

// ---- the booking route
test('a booking with a missing address is a 400 that says so, and every other failure is a 400 with a field message', async () => {
  await harness.install();
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
    services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
  });
  try {
    for (const address of [undefined, '', '   ']) {
      const res = await harness.post({ address });
      assert.equal(res.status, 400, String(address));
      assert.equal(res.body.message, 'Address is required.');
    }
    const badPhone = await harness.post({ contactNumber: 'abc' });
    assert.equal(badPhone.status, 400);
    assert.match(badPhone.body.message, /contact number/i);
    assert.equal(harness.state.bookings.length, 0);
  } finally {
    harness.close();
  }
});

// ---- the password rule for a new account: 8 or more characters, a number and a special character (registration only)
test('registration needs a number and a special character as well as 8 characters', () => {
  const msg = (password) => validateRegistration({ ...GOOD, password });
  assert.equal(msg('longenough1!'), null);
  assert.equal(msg('Abcdef1!'), null, 'exactly 8 characters is enough');
  ['longenough1', 'longenough!', 'longenough', '12345678', '!!!!!!!!', 'a1!'].forEach((password) => {
    assert.equal(msg(password).status, 400, password);
  });
  assert.match(msg('longenough1').message, /1 number and 1 special character/);
});

test('the form hint and the server agree, and signing in or changing a password is not held to the new rule', async () => {
  const { pathToFileURL } = require('node:url');
  const path = require('node:path');
  const checks = await import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'passwordChecks.js')).href);
  ['longenough1!', 'longenough1', 'longenough!', 'short1!', ''].forEach((password) => {
    assert.equal(checks.passwordIsAcceptable(password), validateRegistration({ ...GOOD, password }) === null, password);
  });
  assert.deepEqual(checks.passwordChecks('abc').map((c) => c.met), [false, false, false]);
  assert.deepEqual(checks.passwordChecks('abcdefg1!').map((c) => c.met), [true, true, true]);
  const { validateNewPassword } = require('../utils/passwordRules');
  assert.equal(validateNewPassword({ newPassword: 'longenough1' }), null, 'changing a password keeps its old rule');
});

test('registering does not sign the customer in: the form sends them to the login page, and the login page says why', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const page = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'public', 'register_page.jsx'), 'utf8');
  assert.doesNotMatch(page, /localStorage\.setItem\('token'/);
  assert.match(page, /navigate\('\/login'/);
  const login = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'public', 'login_page.jsx'), 'utf8');
  assert.match(login, /Please sign in to continue/);
});
