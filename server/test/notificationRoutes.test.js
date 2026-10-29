'use strict';
// Run with: npm test (inside server/). E20 follow-up: the notification routes behind the category tabs. The real routes and the real auth run in
// a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');

const chainOf = (value) => ({ select() { return this; }, lean() { return this; }, then: (res, rej) => Promise.resolve(value).then(res, rej) });
const orig = { userFindById: User.findById, find: Notification.find, updateMany: Notification.updateMany, aggregate: Notification.aggregate };
let server;
let base;
let limitSeen;
let updates;

test.before(async () => {
  User.findById = (id) => chainOf({ _id: id, role: 'admin', isActive: true });
  Notification.find = () => ({ sort() { return this; }, limit(n) { limitSeen = n; return Promise.resolve([]); } });
  Notification.updateMany = async (filter, change) => { updates.push({ filter, change }); return { modifiedCount: 0 }; };
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', require('../routes/notificationRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  Object.assign(User, { findById: orig.userFindById });
  Object.assign(Notification, { find: orig.find, updateMany: orig.updateMany });
  if (server) server.close();
});

test.beforeEach(() => { authCache.clear(); limitSeen = null; updates = []; });

const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: 'U1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' })}` });
const readAll = (body) => fetch(`${base}/api/notifications/read-all`, { method: 'PATCH', headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });

test('the counts are one row per kind with how many there are and how many are unread, for this user only', async () => {
  let pipeline;
  Notification.aggregate = async (stages) => {
    pipeline = stages;
    return [{ _id: 'payment_submitted', total: 300, unread: 120 }, { _id: 'chat_message', total: 2, unread: 0 }];
  };
  const res = await fetch(`${base}/api/notifications/counts`, { headers: headers() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [{ type: 'payment_submitted', total: 300, unread: 120 }, { type: 'chat_message', total: 2, unread: 0 }]);
  assert.deepEqual(pipeline[0], { $match: { user: 'U1' } }, 'only the logged in user is counted');
  assert.equal((await fetch(`${base}/api/notifications/counts`)).status, 401, 'not without a login');
  Notification.aggregate = orig.aggregate;
});

test('the list is the newest 30 unless more are asked for, and never more than 200', async () => {
  const list = (query) => fetch(`${base}/api/notifications${query}`, { headers: headers() });
  await list('');
  assert.equal(limitSeen, 30);
  await list('?limit=200');
  assert.equal(limitSeen, 200);
  await list('?limit=5000');
  assert.equal(limitSeen, 200);
  await list('?limit=abc');
  assert.equal(limitSeen, 30);
  await list('?limit=-4');
  assert.equal(limitSeen, 30);
});

test('mark all as read with no body marks every unread notification of the user, as before', async () => {
  assert.equal((await readAll()).status, 200);
  assert.deepEqual(updates[0].filter, { user: 'U1', read: false });
  assert.equal(updates[0].change.read, true);
});

test('mark all as read for a category marks only those kinds, for this user only', async () => {
  assert.equal((await readAll({ types: ['payment_submitted', 'payment_verified'] })).status, 200);
  assert.deepEqual(updates[0].filter, { user: 'U1', read: false, type: { $in: ['payment_submitted', 'payment_verified'] } });
});

test('mark all as read for Other leaves out every listed kind', async () => {
  assert.equal((await readAll({ exceptTypes: ['chat_message'] })).status, 200);
  assert.deepEqual(updates[0].filter, { user: 'U1', read: false, type: { $nin: ['chat_message'] } });
});

test('a bad kinds list is a 400 and marks nothing', async () => {
  for (const body of [{ types: 'chat_message' }, { types: [1, 2] }, { types: [{ $ne: 1 }] }, { exceptTypes: { $gt: '' } }, { types: Array.from({ length: 101 }, () => 'x') }]) {
    assert.equal((await readAll(body)).status, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.deepEqual(updates, []);
});
