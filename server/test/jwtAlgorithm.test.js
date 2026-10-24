// Run with: npm test (inside server/). The login token algorithm is pinned: HS256 is signed and HS256 is the only one accepted. A token
// made with another algorithm, or with "alg": "none", is refused by the real auth middleware however it was made. No database is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const auth = require('../middleware/auth');
const { signToken, verifyToken, TOKEN_ALGORITHM } = require('../utils/jwtTokens');
const { authCache } = require('../utils/authCache');

const SECRET = process.env.JWT_SECRET;
const query = (value) => ({ select() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });

let server;
let base;
test.before(async () => {
  User.findById = () => query({ _id: 'CUS1', role: 'customer', isActive: true });
  const app = express();
  app.get('/me', auth, (req, res) => res.json({ id: req.userId, role: req.userRole }));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(() => authCache.clear());

const ask = async (token) => {
  const res = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
};
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

test('a token is signed with HS256, and says so in its header', () => {
  const token = signToken({ id: 'CUS1', role: 'customer' });
  assert.equal(TOKEN_ALGORITHM, 'HS256');
  assert.equal(JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).alg, 'HS256');
  const claims = verifyToken(token);
  assert.equal(claims.id, 'CUS1');
  assert.equal(claims.role, 'customer');
  assert.ok(claims.exp - claims.iat === 24 * 60 * 60, 'it lasts one day');
});

test('a normal HS256 token is accepted by the real auth middleware', async () => {
  const res = await ask(signToken({ id: 'CUS1', role: 'customer' }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: 'CUS1', role: 'customer' });
});

test('a token signed with another HMAC algorithm (HS384, HS512) is refused, even with the right secret', async () => {
  for (const algorithm of ['HS384', 'HS512']) {
    const token = jwt.sign({ id: 'CUS1', role: 'customer' }, SECRET, { algorithm, expiresIn: '1d' });
    assert.throws(() => verifyToken(token), /invalid algorithm/);
    const res = await ask(token);
    assert.equal(res.status, 401, algorithm);
    assert.equal(res.body.message, 'Invalid or expired token');
  }
});

test('a token with "alg": "none" is refused, with or without a signature part', async () => {
  const header = b64({ alg: 'none', typ: 'JWT' });
  const payload = b64({ id: 'ADM1', role: 'admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  for (const token of [`${header}.${payload}.`, `${header}.${payload}`, `${b64({ alg: 'None', typ: 'JWT' })}.${payload}.`, `${b64({ alg: 'NONE', typ: 'JWT' })}.${payload}.`]) {
    assert.throws(() => verifyToken(token));
    assert.equal((await ask(token)).status, 401, token.slice(0, 30));
  }
});

test('a token signed with an RSA algorithm is refused, and so is the classic key confusion (the secret used as an RS256 header)', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rs = jwt.sign({ id: 'CUS1', role: 'customer' }, privateKey, { algorithm: 'RS256', expiresIn: '1d' });
  assert.equal((await ask(rs)).status, 401);
  // a forged token that claims RS256 but is signed with the HMAC secret
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const payload = b64({ id: 'ADM1', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 });
  const signature = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  assert.equal((await ask(`${header}.${payload}.${signature}`)).status, 401);
});

test('a token made with the wrong secret, or expired, is still refused', async () => {
  assert.equal((await ask(signToken({ id: 'CUS1', role: 'customer' }, 'another-secret-entirely-12345'))).status, 401);
  const expired = jwt.sign({ id: 'CUS1', role: 'customer' }, SECRET, { algorithm: 'HS256', expiresIn: -10 });
  assert.equal((await ask(expired)).status, 401);
});

test('every place that signs or reads a token goes through the pinned helper', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const offenders = [];
  const skip = new Set(['node_modules', 'test', 'scripts', 'uploads']);
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(rel); return; }
    if (!entry.name.endsWith('.js') || rel === path.join('utils', 'jwtTokens.js')) return;
    if (/jwt\.(sign|verify|decode)\(|require\('jsonwebtoken'\)/.test(fs.readFileSync(path.join(root, rel), 'utf8'))) offenders.push(rel);
  });
  walk('.');
  assert.deepEqual(offenders, [], `these files use jsonwebtoken directly: ${offenders.join(', ')}`);
});
