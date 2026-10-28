// Run with: npm test (inside server/). E16: forgot password. The real routes, limiters and auth middleware run in a tiny Express app; the user and
// token collections are replaced by in-memory stand-ins and the email sender by a stub, so no database is needed and nothing is ever sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const fs = require('node:fs');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const AuditLog = require('../models/AuditLog');
const { authCache } = require('../utils/authCache');
const { hashPassword } = require('../utils/password');
const reset = require('../utils/passwordReset');
const { RATE_LIMITS, passwordResetRequestLimiter, passwordResetUseLimiter } = require('../middleware/rateLimit');
const { checkEnvironment } = require('../config/envCheck');

const OLD = 'old-password-1';
const NEW = 'a-better-one-9!';
let users;
let tokens; // the token collection
let sent; // what the stubbed sender was given
let audits;
let server;
let base;

const stubMailer = async ({ to, link }) => { sent.push({ to, link }); };

test.before(async () => {
  const query = (value) => ({ select() { return this; }, then: (res, rej) => Promise.resolve(value).then(res, rej) });
  User.findOne = (filter) => query(users.find((u) => filter.email.test(u.email)) || null);
  User.findById = (id) => query(users.find((u) => u._id === id) || null);
  PasswordResetToken.create = async (doc) => { tokens.push({ ...doc, usedAt: null }); };
  PasswordResetToken.updateMany = async (filter, update) => {
    tokens.filter((t) => t.user === filter.user && t.usedAt === null).forEach((t) => { t.usedAt = update.$set.usedAt; });
  };
  PasswordResetToken.findOneAndUpdate = async (filter, update) => {
    const row = tokens.find((t) => t.tokenHash === filter.tokenHash && t.usedAt === null && t.expiresAt > filter.expiresAt.$gt);
    if (!row) return null;
    row.usedAt = update.$set.usedAt;
    return row;
  };
  AuditLog.create = async (doc) => { audits.push(doc); return doc; };
  reset.setResetMailer(stubMailer);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.get('/whoami', require('../middleware/auth'), (req, res) => res.json({ id: req.userId }));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => { reset.setResetMailer(null); if (server) server.close(); });

test.beforeEach(async () => {
  authCache.clear();
  passwordResetRequestLimiter.reset();
  passwordResetUseLimiter.reset();
  reset.RESET_TIMING.minMs = 0;
  tokens = []; sent = []; audits = [];
  const make = async (_id, role, email) => {
    const u = new User({ _id, role, email, name: `${role} one`, password: await hashPassword(OLD) });
    u.save = async () => u;
    return u;
  };
  users = [await make('CUS1', 'customer', 'ana@example.com'), await make('STF1', 'staff', 'tech@example.com'), await make('ADM1', 'admin', 'boss@example.com')];
});

const post = async (path, body) => {
  const res = await fetch(`${base}/api/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, headers: res.headers, body: await res.json() };
};
const forgot = (email) => post('/forgot-password', { email });
const tokenOf = (link) => new URL(link).hash.slice('#token='.length);
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const SAME = { message: 'If that email has an account, we sent a link.' };

test('an unknown email and a known one get the identical answer', async () => {
  const known = await forgot('ana@example.com');
  const unknown = await forgot('nobody@example.com');
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, SAME);
  assert.deepEqual(unknown.body, SAME);
  await settle();
  assert.equal(sent.length, 1, 'only the real account is emailed');
  assert.equal(tokens.length, 1);
});

test('missing, blank or non-text emails get the same answer and send nothing', async () => {
  for (const email of [undefined, '', '   ', 42, { $ne: '' }, 'x'.repeat(300)]) {
    const res = await forgot(email);
    assert.equal(res.status, 200, JSON.stringify(email));
    assert.deepEqual(res.body, SAME);
  }
  assert.equal(sent.length, 0);
});

test('the answer is held to the same minimum time for a known and an unknown email', async () => {
  reset.RESET_TIMING.minMs = 150;
  for (const email of ['ana@example.com', 'nobody@example.com']) {
    const t = Date.now();
    await forgot(email);
    assert.ok(Date.now() - t >= 140, `${email} answered too fast`);
  }
});

test('every role with an email can ask, and the answer never shows the role', async () => {
  for (const email of ['ana@example.com', 'tech@example.com', 'boss@example.com']) {
    const res = await forgot(email);
    assert.deepEqual(res.body, SAME);
  }
  await settle();
  assert.deepEqual(sent.map((m) => m.to), ['ana@example.com', 'tech@example.com', 'boss@example.com']);
});

test('a deactivated account gets the same answer and no email', async () => {
  users[0].isActive = false;
  assert.deepEqual((await forgot('ana@example.com')).body, SAME);
  await settle();
  assert.equal(sent.length, 0);
});

test('the email link has a 32 byte token; only its SHA-256 hash is stored, with the user and a 30 minute expiry', async () => {
  const before = Date.now();
  await forgot('ana@example.com');
  await settle();
  const token = tokenOf(sent[0].link);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(Buffer.from(token, 'hex').length, 32);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].tokenHash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(tokens[0].user, 'CUS1');
  assert.equal(JSON.stringify(tokens).includes(token), false, 'the token itself is never stored');
  const lifetime = tokens[0].expiresAt.getTime() - before;
  assert.ok(lifetime > 29 * 60 * 1000 && lifetime <= 30 * 60 * 1000 + 5000);
  assert.equal(new URL(sent[0].link).pathname, '/reset-password');
  assert.equal(new URL(sent[0].link).search, '', 'the token is in the fragment, so no server or Referer ever sees it');
});

test('the email says it expires in 30 minutes and carries the link', () => {
  const link = 'https://app.example/reset-password#token=abc';
  const { subject, text, html } = reset.renderResetEmail({ link });
  assert.match(subject, /Reset your password/);
  assert.match(text, /expires in 30 minutes/);
  assert.match(html, /expires in 30 minutes/);
  assert.ok(text.includes(link) && html.includes(link));
});

test('the link is built only from an http(s) address', () => {
  assert.equal(reset.resetLink('https://app.example/some/path', 'T'), 'https://app.example/reset-password#token=T');
  assert.equal(reset.resetLink('javascript:alert(1)', 'T'), null);
  assert.equal(reset.resetLink('', 'T'), null);
});

test('a good link resets the password: new bcrypt hash, token spent, and the new password signs in', async () => {
  await forgot('ana@example.com');
  await settle();
  const res = await post('/reset-password', { token: tokenOf(sent[0].link), password: NEW });
  assert.equal(res.status, 200);
  assert.match(res.body.message, /sign in/i);
  assert.equal(await bcrypt.compare(NEW, users[0].password), true);
  assert.equal(users[0].password.startsWith('$2'), true);
  assert.equal(JSON.stringify(res.body).includes(NEW), false);
  assert.ok(tokens[0].usedAt);
  const login = await post('/login', { email: 'ana@example.com', password: NEW });
  assert.equal(login.status, 200);
});

test('a link works once', async () => {
  await forgot('ana@example.com');
  await settle();
  const token = tokenOf(sent[0].link);
  assert.equal((await post('/reset-password', { token, password: NEW })).status, 200);
  const again = await post('/reset-password', { token, password: 'another-one-7?' });
  assert.equal(again.status, 400);
  assert.match(again.body.message, /invalid or has expired/);
  assert.equal(await bcrypt.compare(NEW, users[0].password), true, 'the second attempt changed nothing');
});

test('a second request invalidates the first link', async () => {
  await forgot('ana@example.com');
  await forgot('ana@example.com');
  await settle();
  assert.equal(sent.length, 2);
  assert.equal((await post('/reset-password', { token: tokenOf(sent[0].link), password: NEW })).status, 400);
  assert.equal((await post('/reset-password', { token: tokenOf(sent[1].link), password: NEW })).status, 200);
});

test('a successful reset retires every other link for that user, and leaves other users alone', async () => {
  await forgot('ana@example.com');
  await forgot('tech@example.com');
  await settle();
  tokens.push({ user: 'CUS1', tokenHash: 'x'.repeat(64), expiresAt: new Date(Date.now() + 60000), usedAt: null }); // a stray older live one
  assert.equal((await post('/reset-password', { token: tokenOf(sent[0].link), password: NEW })).status, 200);
  assert.equal(tokens.filter((t) => t.user === 'CUS1' && t.usedAt === null).length, 0);
  assert.equal(tokens.filter((t) => t.user === 'STF1' && t.usedAt === null).length, 1);
});

test('an expired link is refused', async () => {
  await forgot('ana@example.com');
  await settle();
  tokens[0].expiresAt = new Date(Date.now() - 1000);
  const res = await post('/reset-password', { token: tokenOf(sent[0].link), password: NEW });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /invalid or has expired/);
  assert.equal(await bcrypt.compare(OLD, users[0].password), true);
});

test('a wrong, tampered, truncated or non-text token is refused with the same answer', async () => {
  await forgot('ana@example.com');
  await settle();
  const good = tokenOf(sent[0].link);
  const flipped = (good[0] === 'a' ? 'b' : 'a') + good.slice(1);
  const cases = [flipped, good.slice(0, -1), `${good}0`, good.toUpperCase().replace(/[0-9]/g, 'G'), 'x', '', crypto.randomBytes(32).toString('hex'), undefined, 7, { $ne: '' }, [good]];
  for (const token of cases) {
    passwordResetUseLimiter.reset(); // eleven cases would otherwise hit the limit of ten
    const res = await post('/reset-password', { token, password: NEW });
    assert.equal(res.status, 400, JSON.stringify(token));
    assert.match(res.body.message, /invalid or has expired/);
  }
  assert.equal(await bcrypt.compare(OLD, users[0].password), true);
});

test('the new password follows the registration rules, and a rejected password does not spend the link', async () => {
  await forgot('ana@example.com');
  await settle();
  const token = tokenOf(sent[0].link);
  for (const password of [undefined, '', 'short1!', 'nodigitshere!', 'nospecial1234', 12345678, { $ne: '' }]) {
    const res = await post('/reset-password', { token, password });
    assert.equal(res.status, 400, JSON.stringify(password));
    assert.notEqual(res.body.message, reset.RESET_LINK_INVALID);
  }
  assert.equal(tokens[0].usedAt, null, 'the link is still good after bad passwords');
  assert.equal((await post('/reset-password', { token, password: 'exactly8!1' })).status, 200);
});

test('login tokens issued before the reset stop working; a token issued after works', async () => {
  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const tokenAt = (iat) => jwt.sign({ id: 'CUS1', role: 'customer', iat }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const who = async (t) => (await fetch(`${base}/whoami`, { headers: { Authorization: `Bearer ${t}` } })).status;
  const old = tokenAt(nowSeconds() - 120);
  assert.equal(await who(old), 200, 'works before the reset (and is now in the auth cache)');
  await forgot('ana@example.com');
  await settle();
  assert.equal((await post('/reset-password', { token: tokenOf(sent[0].link), password: NEW })).status, 200);
  assert.equal(await who(old), 401, 'the cache was cleared, so the old token is refused at once');
  assert.equal(await who(tokenAt(nowSeconds() + 2)), 200);
});

test('rate limit: 5 requests per email per hour, then 429 with Retry-After, the same for an unknown email', async () => {
  const { max } = RATE_LIMITS.passwordResetRequest;
  assert.equal(max, 5);
  for (let i = 0; i < max; i += 1) assert.equal((await forgot('nobody@example.com')).status, 200);
  const blocked = await forgot('nobody@example.com');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await forgot('Nobody@Example.com')).status, 429, 'letter case does not dodge it');
  assert.equal((await forgot('ana@example.com')).status, 200, 'another email is not affected');
});

test('rate limit: 30 requests per IP per hour', async () => {
  assert.deepEqual({ ...RATE_LIMITS.passwordResetRequest }, { windowMs: 3600000, max: 5, maxPerIp: 30 });
  for (let i = 0; i < 30; i += 1) assert.equal((await forgot(`user${i}@example.com`)).status, 200, `request ${i + 1}`);
  const blocked = await forgot('user99@example.com');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});

test('rate limit: 10 attempts with a link per IP per hour, good or bad', async () => {
  assert.deepEqual({ ...RATE_LIMITS.passwordResetUse }, { windowMs: 3600000, max: 10, maxPerIp: 10 });
  for (let i = 0; i < 10; i += 1) assert.equal((await post('/reset-password', { token: 'bad', password: NEW })).status, 400);
  const blocked = await post('/reset-password', { token: 'bad', password: NEW });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});

test('audit lines for the request and the completed reset carry no token and no password', async () => {
  await forgot('ana@example.com');
  await settle();
  await post('/reset-password', { token: tokenOf(sent[0].link), password: NEW });
  await settle();
  assert.deepEqual(audits.map((a) => a.action), ['password.reset_requested', 'password.reset_completed']);
  assert.ok(audits.every((a) => a.entityId === 'CUS1' && a.actor.id === 'CUS1'));
  const dump = JSON.stringify(audits);
  assert.equal(dump.includes(tokenOf(sent[0].link)), false);
  assert.equal(dump.includes(NEW), false);
  await forgot('nobody@example.com');
  await settle();
  assert.equal(audits.length, 2, 'an unknown email writes nothing');
});

// Collects everything written to the console while `run` executes.
async function captureConsole(run) {
  const lines = [];
  const originals = { warn: console.warn, error: console.error };
  const capture = (...a) => { lines.push(a.join(' ')); };
  console.warn = capture;
  console.error = capture;
  try {
    await run();
  } finally {
    Object.assign(console, originals);
  }
  return lines;
}

test('development prints the link with no recipient; production never prints it', async () => {
  reset.setResetMailer(null);
  try {
    const token = 'T'.repeat(64);
    const dev = await captureConsole(() => reset.deliverResetLink({ to: 'ana@example.com', token, env: { NODE_ENV: 'development' } }));
    assert.equal(dev.length, 1);
    assert.match(dev[0], /^\[dev\] Password reset link \(no email sent\): http:\/\/localhost:5173\/reset-password#token=T+$/);
    assert.equal(dev[0].includes('ana@example.com'), false, 'no recipient is printed');

    // production with no SMTP: nothing is sent, and the link is not printed
    const noSmtp = await captureConsole(() => reset.deliverResetLink({ to: 'ana@example.com', token, env: { NODE_ENV: 'production', APP_URL: 'https://app.example' } }));
    assert.equal(noSmtp.join('\n').includes(token), false);
    assert.equal(noSmtp.join('\n').includes('reset-password'), false);

    // production with SMTP that cannot be reached: the failure is logged, without the link or the token
    const down = { NODE_ENV: 'production', APP_URL: 'https://app.example', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_FROM: 'a@example.com' };
    const failed = await captureConsole(() => reset.deliverResetLink({ to: 'ana@example.com', token, env: down }));
    assert.ok(failed.length >= 1);
    assert.equal(failed.join('\n').includes(token), false);
    assert.equal(failed.join('\n').includes('reset-password'), false);
  } finally {
    reset.setResetMailer(stubMailer);
  }
});

test('requests made while testing never log the token or the password', async () => {
  const lines = await captureConsole(async () => {
    await forgot('ana@example.com');
    await settle();
    const token = tokenOf(sent[0].link);
    await post('/reset-password', { token, password: NEW });
    await post('/reset-password', { token, password: NEW });
    sent.token = token;
  });
  assert.equal(lines.join('\n').includes(sent.token), false);
  assert.equal(lines.join('\n').includes(NEW), false);
});

test('a real email is sent only when SMTP is set, in any environment', () => {
  const src = fs.readFileSync(require.resolve('../utils/passwordReset'), 'utf8');
  const guard = src.indexOf('if (link && smtpConfig(env)) return await sendEmailNow({');
  assert.ok(guard > 0);
  assert.equal(src.split('sendEmailNow({').length - 1, 1, 'no other path reaches the sender');
});

test('production warns when APP_URL or the SMTP settings are missing, naming the variable and no value', () => {
  const prod = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), MONGO_URI: 'mongodb://h/db', CORS_ORIGINS: 'https://a.example' };
  const bare = checkEnvironment(prod).warnings.join(' ');
  assert.match(bare, /APP_URL/);
  assert.match(bare, /SMTP_HOST or SMTP_FROM/);
  const ok = checkEnvironment({ ...prod, APP_URL: 'https://a.example', SMTP_HOST: 'h', SMTP_FROM: 'f@a.example' }).warnings.join(' ');
  assert.equal(/APP_URL|SMTP_HOST/.test(ok), false);
});
