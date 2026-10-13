// Run with: npm test (inside server/). The startup check: production refuses a missing or short JWT_SECRET and a missing MONGO_URI;
// development only warns. No message ever contains a value.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEnvironment, enforceEnvironment, looksLikePlaceholder } = require('../config/envCheck');

const GOOD = 'k9Zr2vQpX7mLw4TnB8cHd3JfGs6YaE1u';
const prod = (over = {}) => ({ NODE_ENV: 'production', JWT_SECRET: GOOD, MONGO_URI: 'present', ...over });

test('production with a good secret and a database address is fine', () => {
  assert.deepEqual(checkEnvironment(prod()), { errors: [], warnings: [] });
});

test('production: a missing secret, a short secret and a missing database address are each an error naming the variable', () => {
  assert.match(checkEnvironment(prod({ JWT_SECRET: undefined })).errors[0], /JWT_SECRET is missing/);
  assert.match(checkEnvironment(prod({ JWT_SECRET: '' })).errors[0], /JWT_SECRET is missing/);
  assert.match(checkEnvironment(prod({ JWT_SECRET: 'a'.repeat(31) })).errors[0], /JWT_SECRET is shorter than 32/);
  assert.deepEqual(checkEnvironment(prod({ JWT_SECRET: 'a'.repeat(32) })).errors, []);
  assert.match(checkEnvironment(prod({ MONGO_URI: undefined })).errors[0], /MONGO_URI is missing/);
  assert.equal(checkEnvironment(prod({ JWT_SECRET: undefined, MONGO_URI: undefined })).errors.length, 2);
});

test('production does not reject a placeholder-looking secret of enough length (length is the rule there)', () => {
  assert.deepEqual(checkEnvironment(prod({ JWT_SECRET: 'change-this-to-a-long-random-string-123' })).errors, []);
});

test('development only warns: short secret, and placeholders', () => {
  const dev = (JWT_SECRET) => checkEnvironment({ NODE_ENV: 'development', JWT_SECRET });
  assert.match(dev('abc').warnings[0], /shorter than 16/);
  assert.deepEqual(dev('abc').errors, []);
  assert.match(dev('dev-secret-aaaaaaaaaaaa').warnings.join(' '), /placeholder/);
  assert.match(dev('change-this-to-a-long-random-string').warnings.join(' '), /placeholder/);
  assert.match(dev('my-test-value-aaaaaaaaaaaa').warnings.join(' '), /placeholder/);
  assert.match(dev('example-value-aaaaaaaaaaaa').warnings.join(' '), /placeholder/);
  assert.deepEqual(dev(GOOD), { errors: [], warnings: [] });
  assert.deepEqual(checkEnvironment({}), { errors: [], warnings: [] }, 'nothing set in development is not this check\'s business');
});

test('the placeholder rule', () => {
  assert.equal(looksLikePlaceholder('MySecretDev'), true);
  assert.equal(looksLikePlaceholder('secret'), false);
  assert.equal(looksLikePlaceholder('Xk29fQ'), false);
});

test('no message contains the value', () => {
  const secret = 'shortvalueXYZ';
  const { errors } = checkEnvironment(prod({ JWT_SECRET: secret }));
  const { warnings } = checkEnvironment({ NODE_ENV: 'development', JWT_SECRET: secret });
  assert.equal([...errors, ...warnings].join(' ').includes(secret), false);
});

test('enforceEnvironment exits with 1 on an error and logs, and does not exit on warnings only', () => {
  const calls = { warn: [], error: [], exit: [] };
  const log = { warn: (m) => calls.warn.push(m), error: (m) => calls.error.push(m) };
  const exit = (code) => calls.exit.push(code);
  enforceEnvironment(prod({ JWT_SECRET: undefined }), { log, exit });
  assert.deepEqual(calls.exit, [1]);
  assert.ok(calls.error.some((m) => m.includes('JWT_SECRET')));
  calls.exit.length = 0;
  enforceEnvironment({ NODE_ENV: 'development', JWT_SECRET: 'abc' }, { log, exit });
  assert.deepEqual(calls.exit, []);
  assert.equal(calls.warn.length, 1);
});
