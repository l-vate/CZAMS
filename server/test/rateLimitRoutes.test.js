// Run with: npm test (inside server/). E15-3: the limits are named numbers in one place, and the limiters for password change, payment
// submission, file upload and the public calendar. The login and registration limits are tested in rateLimit.test.js. The limiters
// run for real in tiny Express apps; no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const { hashPassword } = require('../utils/password');
const {
  RATE_LIMITS, createRateLimiter, createWindowLimiter, passwordChangeLimiter, uploadLimiter, paymentLimiter, availabilityLimiter, loginLimiter, registerLimiter, limitsEnabled,
} = require('../middleware/rateLimit');

test('the limits are the agreed numbers, in one place', () => {
  const min = 60 * 1000;
  assert.deepEqual({ ...RATE_LIMITS.login }, { windowMs: 15 * min, max: 10, maxPerIp: 60 });
  assert.deepEqual({ ...RATE_LIMITS.register }, { windowMs: 60 * min, max: 10, maxPerIp: 60 });
  assert.deepEqual({ ...RATE_LIMITS.upload }, { windowMs: 10 * min, max: 30 });
  assert.deepEqual({ ...RATE_LIMITS.payment }, { windowMs: 60 * min, max: 20 });
  assert.deepEqual({ ...RATE_LIMITS.availability }, { windowMs: 10 * min, max: 300 });
  assert.ok(RATE_LIMITS.passwordChange.max > 0);
  assert.throws(() => { 'use strict'; RATE_LIMITS.login.max = 1000; }, TypeError, 'the table cannot be changed while the server runs');
});

function windowHarness(over = {}) {
  let clock = 5_000_000;
  const limiter = createWindowLimiter({ windowMs: 10 * 60 * 1000, max: 3, label: 'file uploads', keysFor: (req) => [`user:${req.userId}`], now: () => clock, enabled: () => true, ...over });
  const hit = (userId) => {
    let out = { passed: false };
    const headers = {};
    const res = {
      set(k, v) { headers[k] = v; },
      status(code) { out = { passed: false, status: code }; return this; },
      json(body) { out.body = body; out.headers = headers; return this; },
    };
    limiter({ userId }, res, () => { out = { passed: true }; });
    return out;
  };
  return { hit, advance: (ms) => { clock += ms; }, limiter };
}

test('a window limiter lets max requests through, then answers 429 with a message and Retry-After', () => {
  const { hit } = windowHarness();
  for (let i = 0; i < 3; i += 1) assert.equal(hit('CUS1').passed, true);
  const blocked = hit('CUS1');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /^Too many file uploads\. Please wait \d+ minutes? and try again\.$/);
  assert.equal(Number(blocked.headers['Retry-After']) > 0, true);
  assert.deepEqual(Object.keys(blocked.body), ['message']);
});

test('a window limiter counts each user on their own, and the window ends', () => {
  const { hit, advance } = windowHarness();
  for (let i = 0; i < 4; i += 1) hit('CUS1');
  assert.equal(hit('CUS1').passed, false);
  assert.equal(hit('CUS2').passed, true, 'another user is not affected');
  advance(10 * 60 * 1000 + 1000);
  assert.equal(hit('CUS1').passed, true, 'after the window the user can upload again');
});

test('Retry-After counts down the rest of the window', () => {
  const { hit, advance } = windowHarness();
  for (let i = 0; i < 3; i += 1) hit('CUS1');
  advance(9 * 60 * 1000);
  const blocked = hit('CUS1');
  assert.equal(Number(blocked.headers['Retry-After']) <= 60, true);
});

test('a limiter that is switched off never blocks, and normal use is not blocked at the real limits', () => {
  const off = windowHarness({ enabled: () => false });
  for (let i = 0; i < 50; i += 1) assert.equal(off.hit('CUS1').passed, true);
  const upload = windowHarness({ ...RATE_LIMITS.upload });
  for (let i = 0; i < RATE_LIMITS.upload.max; i += 1) assert.equal(upload.hit('CUS1').passed, true, `upload ${i + 1} of a normal session`);
  const payment = windowHarness({ ...RATE_LIMITS.payment });
  for (let i = 0; i < 5; i += 1) assert.equal(payment.hit('CUS1').passed, true, 'a handful of payments is normal use');
  assert.equal(upload.hit('CUS1').passed, false, 'the 31st upload in ten minutes is not');
});

test('the test runner turns the new limiters off, RATE_LIMITS=on turns them on', () => {
  const before = process.env.RATE_LIMITS;
  try {
    delete process.env.RATE_LIMITS;
    assert.equal(limitsEnabled(), false, 'under node --test, so a test with many payments is not blocked');
    process.env.RATE_LIMITS = 'on';
    assert.equal(limitsEnabled(), true);
    process.env.RATE_LIMITS = 'off';
    assert.equal(limitsEnabled(), false);
  } finally {
    if (before === undefined) delete process.env.RATE_LIMITS; else process.env.RATE_LIMITS = before;
  }
});

test('the real limiter instances stop at their numbers when switched on (public availability: 300 per ten minutes per IP)', async () => {
  const before = process.env.RATE_LIMITS;
  process.env.RATE_LIMITS = 'on';
  const app = express();
  app.use((req, res, next) => { req.userId = req.headers['x-test-user']; next(); });
  app.get('/availability', availabilityLimiter, (req, res) => res.json({ ok: true }));
  app.post('/upload', uploadLimiter, (req, res) => res.json({ ok: true }));
  app.post('/pay', paymentLimiter, (req, res) => res.json({ ok: true }));
  app.put('/password', passwordChangeLimiter, (req, res) => res.json({ ok: true }));
  const srv = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const url = `http://127.0.0.1:${srv.address().port}`;
  const resetAll = () => { availabilityLimiter.reset(); uploadLimiter.reset(); paymentLimiter.reset(); passwordChangeLimiter.reset(); };
  try {
    resetAll();
    for (let i = 0; i < 300; i += 1) assert.equal((await fetch(`${url}/availability`)).status, 200);
    const over = await fetch(`${url}/availability`);
    assert.equal(over.status, 429);
    assert.equal(Number(over.headers.get('retry-after')) > 0, true);
    assert.match((await over.json()).message, /Too many requests for the calendar/);
    for (const [route, method, count] of [['/upload', 'POST', RATE_LIMITS.upload.max], ['/pay', 'POST', RATE_LIMITS.payment.max], ['/password', 'PUT', RATE_LIMITS.passwordChange.max]]) {
      const call = (user) => fetch(`${url}${route}`, { method, headers: { 'x-test-user': user } });
      for (let i = 0; i < count; i += 1) assert.equal((await call('CUS1')).status, 200, `${route} ${i + 1}`);
      assert.equal((await call('CUS1')).status, 429, `${route} over its limit`);
      assert.equal((await call('CUS2')).status, 200, `${route} counts per user`);
    }
  } finally {
    resetAll();
    if (before === undefined) delete process.env.RATE_LIMITS; else process.env.RATE_LIMITS = before;
    srv.close();
  }
});

test('the limiters sit on the routes that need them, after the login check and before the file is read', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'routes', file), 'utf8');
  const bookings = read('bookingRoutes.js');
  assert.match(bookings, /'\/:bookingId\/pay', auth, allowRoles\(ROLE\.CUSTOMER\), paymentLimiter, uploadLimiter, paymentUpload\.single/);
  assert.match(bookings, /'\/:bookingId\/pay-balance', auth, allowRoles\(ROLE\.CUSTOMER\), paymentLimiter, uploadLimiter, paymentUpload\.single/);
  assert.match(bookings, /router\.post\('\/', auth, allowRoles\(ROLE\.CUSTOMER, ROLE\.ADMIN\), uploadLimiter,/);
  assert.match(bookings, /discount\/request', auth, allowRoles\(ROLE\.CUSTOMER\), uploadLimiter, upload\.single/);
  assert.match(bookings, /unit-purchase-proof', auth, auditSpecs\.unitPurchaseProof, allowRoles\(ROLE\.ADMIN\), uploadLimiter, upload\.single/);
  assert.match(bookings, /refund', auth, auditSpecs\.refundProcess, allowRoles\(ROLE\.ADMIN\), uploadLimiter, upload\.single/);
  const auth = read('authRoutes.js');
  assert.match(auth, /'\/profile\/photo', auth, uploadLimiter, upload\.single/);
  assert.match(auth, /'\/change-password', auth, passwordChangeLimiter,/);
  assert.match(auth, /'\/login', loginLimiter,/);
  assert.match(auth, /'\/register', registerLimiter,/);
  assert.match(read('reportRoutes.js'), /router\.post\('\/', auth, uploadLimiter, receivePhoto,/);
  assert.match(read('availabilityRoutes.js'), /'\/public', availabilityLimiter,/);
});

// ---- the real login and registration routes: the answer never says whether an account exists
const GOOD = 'a-good-password-1';
let server;
let base;

test.before(async () => {
  const user = new User({ _id: 'CUS1', role: 'customer', email: 'real@example.com', name: 'Real', password: await hashPassword(GOOD) });
  User.findOne = async (filter) => ((filter.email instanceof RegExp ? filter.email.test('real@example.com') : filter.email === 'real@example.com') ? user : null);
  User.create = async (doc) => ({ ...doc, toObject() { return doc; } });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { loginLimiter.reset(); registerLimiter.reset(); });

const login = async (email, password) => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { status: res.status, body: await res.json() };
};

test('an unknown email costs the same password check as a wrong password, and gets the same answer', async () => {
  const bcrypt = require('bcryptjs');
  const real = bcrypt.compare;
  let compares = 0;
  bcrypt.compare = (...args) => { compares += 1; return real(...args); };
  try {
    const wrong = await login('real@example.com', 'wrong-password-1');
    const unknown = await login('nobody@example.com', 'wrong-password-1');
    assert.equal(compares, 2, 'both ran a password comparison');
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.body, wrong.body, 'the same message');
  } finally {
    bcrypt.compare = real;
  }
});

test('registration is 60 per hour per IP', async () => {
  const register = () => fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  for (let i = 0; i < 60; i += 1) assert.notEqual((await register()).status, 429, `registration ${i + 1}`);
  const blocked = await register();
  assert.equal(blocked.status, 429);
  assert.equal(Number(blocked.headers.get('retry-after')) > 15 * 60, true, 'the window is an hour, not 15 minutes');
});

test('a username counts like an email for the per account login limit', async () => {
  const wrong = () => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'SomeOne', password: 'x' }) });
  for (let i = 0; i < 10; i += 1) assert.equal((await wrong()).status, 401);
  assert.equal((await wrong()).status, 429);
});

test('a classroom on one network is not blocked: many people logging in with their own accounts share one address freely', async () => {
  // 40 different students each mistype once from the same address: nobody is blocked, and each account has only one failure
  for (let i = 0; i < 40; i += 1) assert.equal((await login(`student${i}@example.com`, 'wrong-password-1')).status, 401, `student ${i + 1}`);
  assert.equal((await login('real@example.com', GOOD)).status, 200, 'and a real login still works');
});

test('one account is still locked after 10 wrong passwords, even from many addresses', () => {
  const clock = 1_000;
  const limiter = createRateLimiter({ windowMs: RATE_LIMITS.login.windowMs, max: RATE_LIMITS.login.max, maxPerIp: RATE_LIMITS.login.maxPerIp, now: () => clock, countOn: (s) => s === 401 });
  const attempt = (ip, email) => {
    let passed = false;
    const finishers = [];
    const res = { statusCode: 401, set() {}, status(c) { this.statusCode = c; return this; }, json() { return this; }, on(e, f) { if (e === 'finish') finishers.push(f); } };
    limiter({ ip, body: { email } }, res, () => { passed = true; });
    if (passed) finishers.forEach((f) => f());
    return passed;
  };
  for (let i = 0; i < 10; i += 1) assert.equal(attempt(`1.1.1.${i}`, 'victim@example.com'), true);
  assert.equal(attempt('2.2.2.2', 'victim@example.com'), false, 'the account is locked whatever the address');
  assert.equal(attempt('2.2.2.2', 'someone-else@example.com'), true, 'while another account from that address is fine');
});
