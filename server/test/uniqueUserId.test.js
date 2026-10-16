// Run with: npm test (inside server/). Registering draws a random public id (CUS1234). If two accounts draw the same one the second
// is retried with a new id, never answered with a server error; a duplicate email is reported as such; running out of tries is a
// clear 503. The real route runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../models/User');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');
const { createWithUniqueUserId, UserIdExhaustedError, isDuplicateOn } = require('../utils/uniqueUserId');
const { chain } = require('./helpers/memoryQueries');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-a-real-one';

const idCollision = () => Object.assign(new Error('E11000 duplicate key error collection: users index: _id_ dup key'), { code: 11000, keyPattern: { _id: 1 } });
const emailCollision = () => Object.assign(new Error('E11000 duplicate key error collection: users index: email_1'), { code: 11000, keyPattern: { email: 1 } });

test('the rule on its own: a collision on the id is retried with a new id', async () => {
  const tried = [];
  const ids = ['CUS1111', 'CUS1111', 'CUS2222'];
  const saved = await createWithUniqueUserId(async (id) => { tried.push(id); if (tried.length < 3) throw idCollision(); return { _id: id }; }, () => ids.shift());
  assert.deepEqual(tried, ['CUS1111', 'CUS1111', 'CUS2222']);
  assert.equal(saved._id, 'CUS2222');
});

test('a duplicate email, or any other error, is not retried', async () => {
  let calls = 0;
  await assert.rejects(createWithUniqueUserId(async () => { calls += 1; throw emailCollision(); }, () => 'CUS1'), (err) => isDuplicateOn('email', err));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(createWithUniqueUserId(async () => { calls += 1; throw new Error('db down'); }, () => 'CUS1'), /db down/);
  assert.equal(calls, 1);
});

test('after too many collisions it gives up with a clear error', async () => {
  let calls = 0;
  await assert.rejects(createWithUniqueUserId(async () => { calls += 1; throw idCollision(); }, () => 'CUS1', 3), UserIdExhaustedError);
  assert.equal(calls, 3);
});

test('the id collision is told apart from the email collision', () => {
  assert.equal(isDuplicateOn('_id', idCollision()), true);
  assert.equal(isDuplicateOn('_id', emailCollision()), false);
  assert.equal(isDuplicateOn('email', emailCollision()), true);
  assert.equal(isDuplicateOn('_id', new Error('x')), false);
  assert.equal(isDuplicateOn('_id', null), false);
});

test.describe('through the register route', () => {
  let server;
  let base;
  let attempts;
  let plan;

  test.before(async () => {
    User.findOne = () => chain(null);
    User.create = async (d) => {
      attempts.push(d._id);
      const next = plan.shift();
      if (next === 'id') throw idCollision();
      if (next === 'email') throw emailCollision();
      return { ...d, role: 'customer' };
    };
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/authRoutes'));
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.after(() => server && server.close());
  test.beforeEach(() => { attempts = []; plan = []; loginLimiter.reset(); registerLimiter.reset(); });

  const register = async () => {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com', phone: '0917 123 4567', password: 'longenough1' }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  test('two collisions then success is a 201 on the third id', async () => {
    plan = ['id', 'id'];
    const res = await register();
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(attempts.length, 3);
    assert.match(res.body.user.id, /^CUS\d{4}$/);
  });

  test('a duplicate email from the database is a 400, not a 500', async () => {
    plan = ['email'];
    const res = await register();
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Email already registered');
    assert.equal(attempts.length, 1);
  });

  test('collisions every time is a 503 with a clear message', async () => {
    plan = Array(20).fill('id');
    const res = await register();
    assert.equal(res.status, 503);
    assert.match(res.body.message, /try again/);
  });
});
