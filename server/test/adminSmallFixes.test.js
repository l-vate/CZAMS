// Run with: npm test (inside server/). The walk-in booking list offers active customers only, and an account an admin creates gets the same
// kind of public id as one that registers (CUS1234, STF1234, ADM1234), retried when two draw the same one. Existing ids are untouched: nothing
// here changes stored data. The real create route and the real auth run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { authCache } = require('../utils/authCache');
const { generateUserId } = require('../utils/uniqueUserId');
const { chain } = require('./helpers/memoryQueries');

// ---- the walk-in list
test('the walk-in list offers active customer accounts only, narrowed by the search text', async () => {
  const { selectableCustomers } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'walkInCustomers.js')).href);
  const people = [
    { _id: 'CUS1', name: 'Ana Cruz', email: 'ana@example.test', phone: '0917111', role: 'customer', isActive: true },
    { _id: 'CUS2', name: 'Ben Reyes', email: 'ben@example.test', phone: '0917222', role: 'customer', isActive: false },
    { _id: 'CUS3', name: 'Cara Lim', email: 'cara@example.test', phone: '0917333', role: 'customer' },
    { _id: 'STF1', name: 'Tech', email: 'tech@example.test', role: 'staff', isActive: true },
  ];
  assert.deepEqual(selectableCustomers(people).map((c) => c._id), ['CUS1', 'CUS3'], 'a deactivated customer and a staff account are not offered');
  assert.deepEqual(selectableCustomers(people, 'ben').map((c) => c._id), [], 'searching for the deactivated customer finds nobody');
  assert.deepEqual(selectableCustomers(people, 'CARA@').map((c) => c._id), ['CUS3']);
  assert.deepEqual(selectableCustomers(people, '0917111').map((c) => c._id), ['CUS1']);
  assert.deepEqual(selectableCustomers(null), []);
});

// ---- the id generator
test('one generator: CUS, STF and ADM with four digits', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(generateUserId('customer'), /^CUS\d{4}$/);
    assert.match(generateUserId('staff'), /^STF\d{4}$/);
    assert.match(generateUserId('admin'), /^ADM\d{4}$/);
  }
});

// ---- an admin creating an account
let server;
let base;
let created;
let failIds;

test.before(async () => {
  AuditLog.create = async (d) => d;
  User.findById = (id) => chain(id === 'ADM1' ? { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' } : null);
  User.findOne = () => chain(null);
  User.create = async (doc) => {
    if (failIds > 0) {
      failIds -= 1;
      throw Object.assign(new Error('E11000 duplicate key error collection: users index: _id_ dup key'), { code: 11000, keyPattern: { _id: 1 } });
    }
    created.push(doc);
    return { ...doc, toObject() { return { ...doc }; } };
  };
  const app = express();
  app.use(express.json());
  app.use('/api/users', require('../routes/userRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); created = []; failIds = 0; });

const create = async (fields) => {
  const token = jwt.sign({ id: 'ADM1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(fields) });
  return { status: res.status, body: await res.json() };
};
const person = (over) => ({ name: 'Test Person', email: `p${Math.random().toString(36).slice(2, 8)}@example.test`, phone: '09171230000', password: 'Correct-Horse-9', ...over });

test('a customer, a technician and an admin created by an admin get CUS, STF and ADM ids, not a long random id', async () => {
  const customer = await create(person({ role: 'customer' }));
  const staff = await create(person({ role: 'staff', position: 'Technician' }));
  const admin = await create(person({ role: 'admin' }));
  assert.deepEqual([customer.status, staff.status, admin.status], [201, 201, 201], JSON.stringify([customer.body, staff.body, admin.body]));
  assert.match(customer.body._id, /^CUS\d{4}$/);
  assert.match(staff.body._id, /^STF\d{4}$/);
  assert.match(admin.body._id, /^ADM\d{4}$/);
  assert.equal(created.some((u) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(u._id)), false, 'no long random id any more');
});

test('with no role given, the account is a customer with a CUS id', async () => {
  const res = await create(person({}));
  assert.equal(res.status, 201);
  assert.match(res.body._id, /^CUS\d{4}$/);
});

test('two accounts drawing the same id: the second is tried again with a new id and is still created', async () => {
  failIds = 2;
  const res = await create(person({ role: 'staff', position: 'Helper' }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.match(res.body._id, /^STF\d{4}$/);
  assert.equal(created.length, 1);
});

test('running out of tries is a clear 503, never a 500', async () => {
  failIds = 99;
  const res = await create(person({ role: 'customer' }));
  assert.equal(res.status, 503);
  assert.match(res.body.message, /try again/i);
});
