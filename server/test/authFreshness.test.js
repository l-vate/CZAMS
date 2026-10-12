// Run with: npm test (inside server/). The real auth middleware runs in a tiny Express app; only the
// database lookup is stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const auth = require('../middleware/auth');
const { createAuthCache, authCache, clearAuthCache } = require('../utils/authCache');

// ---- the cache on its own, with a fake clock
test('an entry is remembered for the ttl and then forgotten', () => {
  let clock = 1000;
  const cache = createAuthCache({ ttlMs: 5000, now: () => clock });
  cache.set('STF1', { role: 'staff' });
  assert.deepEqual(cache.get('STF1'), { role: 'staff' });
  clock += 4999;
  assert.deepEqual(cache.get('STF1'), { role: 'staff' });
  clock += 1;
  assert.equal(cache.get('STF1'), null);
});

test('clear forgets one account at once, or all of them', () => {
  const cache = createAuthCache();
  cache.set('A', 1);
  cache.set('B', 2);
  cache.clear('A');
  assert.equal(cache.get('A'), null);
  assert.equal(cache.get('B'), 2);
  cache.clear();
  assert.equal(cache.get('B'), null);
});

// ---- the middleware
let account; // what the stubbed database holds for the one test user: { role, isActive } or null
let lookups = 0;

const query = (value) => ({
  select() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

let server;
let base;

test.before(async () => {
  User.findById = () => {
    lookups += 1;
    return query(account);
  };
  const app = express();
  app.get('/whoami', auth, (req, res) => res.json({ id: req.userId, role: req.userRole }));
  app.get('/admin-only', auth, (req, res) => (req.userRole === 'admin' ? res.json({ ok: true }) : res.status(403).json({ message: 'Forbidden' })));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test.beforeEach(() => {
  authCache.clear();
  lookups = 0;
  account = { role: 'staff', isActive: true };
});

const call = async (path, tokenRole = 'staff') => {
  const token = jwt.sign({ id: 'STF1', role: tokenRole }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
};

test('the role comes from the database, not from the token', async () => {
  // the token still says admin, but the account is now a technician
  const asked = await call('/admin-only', 'admin');
  assert.equal(asked.status, 403);
  const who = await call('/whoami', 'admin');
  assert.equal(who.body.role, 'staff');
});

test('a role change applies at once when the cache is cleared (what the admin edit does)', async () => {
  assert.equal((await call('/whoami')).body.role, 'staff');
  account = { role: 'admin', isActive: true };
  assert.equal((await call('/whoami')).body.role, 'staff'); // still inside the few seconds
  clearAuthCache('STF1');
  assert.equal((await call('/whoami')).body.role, 'admin');
});

test('a deactivated technician is refused on the next request, with the deactivated message', async () => {
  assert.equal((await call('/whoami')).status, 200);
  account = { role: 'staff', isActive: false };
  clearAuthCache('STF1'); // the admin edit clears it
  const res = await call('/whoami');
  assert.equal(res.status, 403);
  assert.match(res.body.message, /deactivated/);
});

test('a deactivation is also caught on its own once the few seconds pass', async () => {
  let clock = 0;
  const cache = createAuthCache({ ttlMs: 5000, now: () => clock });
  cache.set('STF1', { exists: true, role: 'staff', isActive: true });
  clock += 5000;
  assert.equal(cache.get('STF1'), null); // the middleware would look the account up again
});

test('an account that no longer exists is a 401', async () => {
  account = null;
  const res = await call('/whoami');
  assert.equal(res.status, 401);
  assert.match(res.body.message, /no longer exists/);
});

test('requests inside the few seconds share one lookup', async () => {
  await call('/whoami');
  await call('/whoami');
  await call('/whoami');
  assert.equal(lookups, 1);
});

test('no token and a bad token are still 401', async () => {
  const none = await fetch(`${base}/whoami`);
  assert.equal(none.status, 401);
  const bad = await fetch(`${base}/whoami`, { headers: { Authorization: 'Bearer not.a.token' } });
  assert.equal(bad.status, 401);
});
