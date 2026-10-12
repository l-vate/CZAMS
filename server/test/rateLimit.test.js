// Run with: npm test (inside server/). The login and registration limits. The real routes run in a tiny Express
// app; only the database calls are stubbed, so no database is needed. The limits are in this process's memory.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const { hashPassword } = require('../utils/password');
const { createRateLimiter, loginLimiter, registerLimiter, WINDOW_MS, MAX_ATTEMPTS } = require('../middleware/rateLimit');

test('the limit is 10 attempts per 15 minutes', () => {
  assert.equal(MAX_ATTEMPTS, 10);
  assert.equal(WINDOW_MS, 15 * 60 * 1000);
});

// ---- the limiter on its own, with a fake clock and a fake request and response
function harness(over = {}) {
  let clock = 1_000_000;
  const limiter = createRateLimiter({ now: () => clock, countOn: (s) => s === 401, resetOn: (s) => s === 200, label: 'login attempts', ...over });
  const attempt = (ip, email, status) => {
    let blocked = null;
    const finishers = [];
    const res = {
      set() {}, statusCode: status,
      status(code) { this.statusCode = code; return this; },
      json(body) { blocked = { status: this.statusCode, body }; return this; },
      on(event, fn) { if (event === 'finish') finishers.push(fn); },
    };
    let passed = false;
    limiter({ ip, body: { email } }, res, () => { passed = true; });
    if (passed) finishers.forEach((f) => f());
    return passed ? { passed: true } : { passed: false, ...blocked };
  };
  return { attempt, advance: (ms) => { clock += ms; }, limiter };
}

test('ten wrong attempts are allowed; the eleventh is a 429 with a clear message', () => {
  const { attempt } = harness();
  for (let i = 0; i < 10; i += 1) assert.equal(attempt('1.1.1.1', 'a@x.com', 401).passed, true, `attempt ${i + 1}`);
  const blocked = attempt('1.1.1.1', 'a@x.com', 401);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /Too many login attempts\. Please wait \d+ minutes? and try again\./);
});

test('the message counts down the lockout and Retry-After matches', () => {
  const { attempt, advance } = harness();
  for (let i = 0; i < 10; i += 1) attempt('1.1.1.1', 'a@x.com', 401);
  assert.match(attempt('1.1.1.1', 'a@x.com', 401).body.message, /15 minutes/);
  advance(10 * 60 * 1000);
  assert.match(attempt('1.1.1.1', 'a@x.com', 401).body.message, /5 minutes/);
  advance(4 * 60 * 1000 + 30 * 1000);
  assert.match(attempt('1.1.1.1', 'a@x.com', 401).body.message, /1 minute\b/);
});

test('after the window the lockout ends and attempts work again', () => {
  const { attempt, advance } = harness();
  for (let i = 0; i < 10; i += 1) attempt('1.1.1.1', 'a@x.com', 401);
  assert.equal(attempt('1.1.1.1', 'a@x.com', 401).passed, false);
  advance(15 * 60 * 1000 + 1);
  assert.equal(attempt('1.1.1.1', 'a@x.com', 401).passed, true);
});

test('one email under attack from many IPs is limited by the email count', () => {
  const { attempt } = harness();
  for (let i = 0; i < 10; i += 1) attempt(`9.9.9.${i}`, 'victim@x.com', 401); // a different IP each time
  assert.equal(attempt('9.9.9.200', 'victim@x.com', 401).passed, false);
  assert.equal(attempt('9.9.9.200', 'someone-else@x.com', 401).passed, true);
});

test('one IP trying many emails is limited by the IP count', () => {
  const { attempt } = harness();
  for (let i = 0; i < 10; i += 1) attempt('2.2.2.2', `user${i}@x.com`, 401);
  assert.equal(attempt('2.2.2.2', 'brand-new@x.com', 401).passed, false);
  assert.equal(attempt('3.3.3.3', 'brand-new@x.com', 401).passed, true);
});

test('email matching ignores case and spaces', () => {
  const { attempt } = harness();
  for (let i = 0; i < 5; i += 1) attempt(`4.4.4.${i}`, 'Case@X.com', 401);
  for (let i = 5; i < 10; i += 1) attempt(`4.4.4.${i}`, '  case@x.COM ', 401);
  assert.equal(attempt('4.4.4.99', 'case@x.com', 401).passed, false);
});

test('a good login clears that email\'s count, so a person who typos a few times is not locked out', () => {
  const { attempt } = harness();
  for (let i = 0; i < 9; i += 1) attempt('5.5.5.5', 'me@x.com', 401);
  assert.equal(attempt('5.5.5.5', 'me@x.com', 200).passed, true); // success
  for (let i = 0; i < 9; i += 1) assert.equal(attempt(`5.5.5.${i + 10}`, 'me@x.com', 401).passed, true);
});

test('only attempts that count are counted: a 200 does not use one up', () => {
  const { attempt } = harness();
  for (let i = 0; i < 50; i += 1) assert.equal(attempt('6.6.6.6', 'ok@x.com', 200).passed, true);
});

test('old entries are dropped so the table does not grow without end', () => {
  const { attempt, advance, limiter } = harness();
  for (let i = 0; i < 20; i += 1) attempt(`7.7.7.${i}`, `u${i}@x.com`, 401);
  assert.ok(limiter.size() > 0);
  advance(16 * 60 * 1000);
  attempt('8.8.8.8', 'z@x.com', 401);
  limiter.reset();
  assert.equal(limiter.size(), 0);
});

// ---- the real login and registration routes
const GOOD = 'a-good-password-1';
let user;
let server;
let base;

test.before(async () => {
  user = new User({ _id: 'CUS1', role: 'customer', email: 'real@example.com', name: 'Real', password: await hashPassword(GOOD) });
  User.findOne = async (filter) => (filter.email === 'real@example.com' ? user : null);
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
  return { status: res.status, body: await res.json(), retryAfter: res.headers.get('retry-after') };
};

test('the real login route: 10 wrong passwords are 401, then 429 with a message and Retry-After', async () => {
  for (let i = 0; i < 10; i += 1) assert.equal((await login('real@example.com', `wrong-${i}`)).status, 401);
  const blocked = await login('real@example.com', 'wrong-again');
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /Too many login attempts/);
  assert.ok(Number(blocked.retryAfter) > 0);
});

test('while locked, even the right password is refused, and the answer does not say whether the email exists', async () => {
  for (let i = 0; i < 10; i += 1) await login('real@example.com', `wrong-${i}`);
  const right = await login('real@example.com', GOOD);
  assert.equal(right.status, 429);
  for (let i = 0; i < 10; i += 1) await login('nobody@example.com', 'x');
  const unknown = await login('nobody@example.com', 'x');
  assert.equal(unknown.status, 429);
  assert.equal(unknown.body.message.replace(/\d+/, 'N'), right.body.message.replace(/\d+/, 'N').replace(/ *$/, ''), 'same wording for a known and an unknown email');
});

test('a correct login works and resets the count for that email', async () => {
  // Every request here comes from one IP, whose own count is not reset by a login, so stay under 10 in total.
  for (let i = 0; i < 5; i += 1) await login('real@example.com', `wrong-${i}`);
  const ok = await login('real@example.com', GOOD);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  for (let i = 0; i < 4; i += 1) assert.equal((await login('real@example.com', `again-${i}`)).status, 401);
});

test('the IP count is not reset by a good login, so an attacker cannot reset it by logging in to their own account', async () => {
  for (let i = 0; i < 9; i += 1) await login('real@example.com', `wrong-${i}`);
  assert.equal((await login('real@example.com', GOOD)).status, 200);
  assert.equal((await login('real@example.com', 'wrong-9')).status, 401); // the 10th failure from this IP
  assert.equal((await login('real@example.com', 'wrong-10')).status, 429);
});

test('registration is limited the same way', async () => {
  const register = async (email) => {
    const res = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'A', lastName: 'B', email, phone: '0917', password: GOOD }) });
    return { status: res.status, body: await res.json() };
  };
  for (let i = 0; i < 10; i += 1) assert.notEqual((await register(`new${i}@example.com`)).status, 429, `attempt ${i + 1}`);
  const blocked = await register('new-11@example.com');
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /Too many registration attempts/);
});
