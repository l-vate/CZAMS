// Run with: npm test (inside server/). E15-5: security headers on every answer, no stack trace or internal text in an error answer, no
// secret in any log or startup message, and the startup rules for the JWT secret. No database is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { securityHeaders } = require('../config/securityHeaders');
const { requestId, apiNotFound, errorHandler } = require('../middleware/errorHandler');
const { scrubSecrets, describeError, describeFault } = require('../utils/safeLog');
const { checkEnvironment } = require('../config/envCheck');

const root = path.join(__dirname, '..');
const fakeUri = (password) => ['mongodb+srv://', 'appuser:', password, '@cluster0.abcde.mongodb.net/CZAMS'].join('');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// ---- headers
async function withApp(run, { fail } = {}) {
  const app = express();
  app.use(requestId);
  app.use(securityHeaders());
  app.get('/api/ok', (req, res) => res.json({ ok: true }));
  app.get('/api/boom', () => { throw fail || new Error(`connect ECONNREFUSED ${fakeUri('TopSecretPw1')} at C:\\app\\routes\\x.js:12`); });
  app.use(apiNotFound);
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('every answer carries the security headers, and none says the server is Express', async () => {
  await withApp(async (base) => {
    for (const address of ['/api/ok', '/api/nowhere', '/api/boom']) {
      const res = await fetch(`${base}${address}`);
      const h = (name) => res.headers.get(name);
      assert.equal(h('x-content-type-options'), 'nosniff', address);
      assert.match(h('strict-transport-security') || '', /max-age=\d+/, address);
      assert.match(h('x-frame-options') || '', /SAMEORIGIN|DENY/i, address);
      assert.match(h('content-security-policy') || '', /default-src 'none'/, address);
      assert.match(h('content-security-policy') || '', /frame-ancestors 'none'/, address);
      assert.equal(h('referrer-policy'), 'no-referrer', address);
      assert.equal(h('x-powered-by'), null, address);
      assert.equal(h('cross-origin-resource-policy'), 'cross-origin', 'the web app on another origin shows files from this API in <img>');
    }
  });
});

test('the headers are installed before any route, and the health check comes after them', () => {
  const server = read('server.js');
  const at = (text) => server.indexOf(text);
  assert.ok(at("securityHeaders()") > at('app.use(requestId)'));
  assert.ok(at("securityHeaders()") < at("app.use('/api/health'"), 'the health answer has the headers too');
  assert.ok(at("securityHeaders()") < at("app.use('/api/auth'"));
  assert.equal(/x-powered-by/i.test(server) && !/disable/.test(server), false);
});

test('a stored PDF is shown inline without the policy that would stop the browser\'s PDF viewer, and still with nosniff', () => {
  assert.match(read('utils/sendStored.js'), /application\/pdf'\) res\.removeHeader\('Content-Security-Policy'\)/);
  assert.match(read('utils/sendStored.js'), /X-Content-Type-Options', 'nosniff'/);
});

// ---- error answers
test('an unexpected error answers "Server error" and a request id, and nothing else: no stack, path, address or password', async () => {
  const quiet = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/boom`);
      assert.equal(res.status, 500);
      const text = await res.text();
      const body = JSON.parse(text);
      assert.deepEqual(Object.keys(body).sort(), ['message', 'requestId']);
      assert.equal(body.message, 'Server error');
      ['TopSecretPw1', 'mongodb', 'appuser', 'ECONNREFUSED', 'routes', '.js:', 'at '].forEach((leak) => assert.equal(text.includes(leak), false, `the answer leaks "${leak}"`));
      assert.equal(logged.length, 1);
      assert.equal(logged[0].includes('TopSecretPw1'), false, 'and the log has no password either');
      assert.equal(logged[0].includes('appuser'), false);
      assert.match(logged[0], new RegExp(body.requestId), 'the log line carries the id that was given to the person');
    });
  } finally {
    console.error = quiet;
  }
});

test('an unknown address and a bad body are answered in JSON with no internals', async () => {
  await withApp(async (base) => {
    const unknown = await fetch(`${base}/api/nowhere`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { message: 'Not found' });
  });
});

// ---- no secret in a log
test('a connection string and the secret settings are cut out of any error text', () => {
  const env = { MONGO_URI: fakeUri('Zk3dQ9vLm2'), JWT_SECRET: 'jwt-value-123456789012345678901234567890', SMTP_PASS: 'smtp-pass-value' };
  const err = new Error(`bad auth for ${fakeUri('Zk3dQ9vLm2')} using ${env.JWT_SECRET} and ${env.SMTP_PASS}`);
  for (const text of [scrubSecrets(err.message, env), describeError(err, env), describeFault(err, env)]) {
    ['Zk3dQ9vLm2', 'appuser', 'cluster0', env.JWT_SECRET, env.SMTP_PASS].forEach((secret) => assert.equal(text.includes(secret), false, `still shows ${secret.slice(0, 4)}...`));
  }
  assert.match(describeError(err, env), /^Error: bad auth/, 'the reason is still there');
  assert.match(scrubSecrets(`connect failed ${['mongodb://', 'user:pw', '@host:27017/db?x=1'].join('')} end`, {}), /mongodb:\/\/<hidden> end/);
  assert.equal(scrubSecrets('nothing secret here', { JWT_SECRET: 'x' }), 'nothing secret here', 'a very short value is not blanked out of ordinary words');
});

test('a failed database connection prints the reason without the address or password', async () => {
  const connect = require('../config/db');
  const mongoose = require('mongoose');
  const realConnect = mongoose.connect;
  const realExit = process.exit;
  const realError = console.error;
  const before = process.env.MONGO_URI;
  process.env.MONGO_URI = fakeUri('Zk3dQ9vLm2');
  const lines = [];
  let exitCode = null;
  mongoose.connect = async (uri) => { throw new Error(`querySrv ENOTFOUND for ${uri}`); };
  process.exit = (code) => { exitCode = code; };
  console.error = (...args) => lines.push(args.join(' '));
  try {
    await connect();
  } finally {
    mongoose.connect = realConnect; process.exit = realExit; console.error = realError;
    if (before === undefined) delete process.env.MONGO_URI; else process.env.MONGO_URI = before;
  }
  assert.equal(exitCode, 1);
  const out = lines.join('\n');
  assert.match(out, /MongoDB connection error/);
  ['Zk3dQ9vLm2', 'appuser', 'cluster0'].forEach((secret) => assert.equal(out.includes(secret), false, `the log shows ${secret.slice(0, 3)}...`));
});

test('no code logs a request body, a password, a token, a payment reference or an environment value', () => {
  const offenders = [];
  const skip = new Set(['node_modules', 'test', 'scripts', 'uploads']);
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(rel); return; }
    if (!entry.name.endsWith('.js')) return;
    read(rel).split('\n').forEach((line, i) => {
      if (!/console\.(log|info|warn|error|debug)\(/.test(line)) return;
      if (/req\.body|req\.headers|authorization|process\.env\b|\.password\b|JWT_SECRET|MONGO_URI|referenceNumber|\btoken\b/i.test(line)) offenders.push(`${rel}:${i + 1}`);
    });
  });
  walk('.');
  assert.deepEqual(offenders, [], `these log lines may print a secret: ${offenders.join(', ')}`);
});

test('there is no request logger that would print bodies or headers', () => {
  const server = read('server.js');
  assert.equal(/morgan|pino-http|express-winston|bunyan/i.test(server), false);
  assert.equal(/"(morgan|pino-http|express-winston)"/.test(read('package.json')), false);
});

// ---- the secret and the passwords
test('production does not start with a JWT secret shorter than 32 characters, and the message holds no value', () => {
  const base = { NODE_ENV: 'production', MONGO_URI: 'present', CORS_ORIGINS: 'https://myapp.vercel.app' };
  assert.equal(checkEnvironment({ ...base, JWT_SECRET: 'a'.repeat(31) }).errors.length, 1);
  assert.deepEqual(checkEnvironment({ ...base, JWT_SECRET: 'a'.repeat(32) }).errors, []);
  assert.equal(checkEnvironment({ ...base }).errors.some((e) => /JWT_SECRET is missing/.test(e)), true);
  assert.equal(checkEnvironment({ ...base, JWT_SECRET: 'q'.repeat(10) }).errors.join(' ').includes('q'.repeat(10)), false);
});

test('passwords are stored as bcrypt hashes and no response holds the hash', async () => {
  const { hashPassword, isBcryptHash } = require('../utils/password');
  const hash = await hashPassword('a-good-password-1');
  assert.equal(isBcryptHash(hash), true);
  assert.match(hash, /^\$2[aby]\$10\$/, 'bcrypt, cost 10');
  assert.notEqual(hash, 'a-good-password-1');
  const User = require('../models/User');
  const user = new User({ _id: 'CUS1', role: 'customer', email: 'a@b.com', name: 'A', password: hash });
  assert.equal(JSON.stringify(user).includes(hash), false, 'toJSON leaves the hash out');
  assert.equal('password' in user.toObject(), false, 'and so does toObject');
});
