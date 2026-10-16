// Run with: npm test (inside server/). The real chat routes and the real auth middleware run in a tiny Express
// app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');
const { matches, chain } = require('./helpers/memoryQueries');

// three admins, one of them deactivated, plus a technician and a customer
const USERS = [
  { _id: 'ADM1', role: 'admin', isActive: true },
  { _id: 'ADM2', role: 'admin', isActive: true },
  { _id: 'ADM3', role: 'admin', isActive: false },
  { _id: 'ADM4', role: 'admin' }, // an old account with no isActive field counts as active
  { _id: 'STF1', role: 'staff', isActive: true },
  { _id: 'CUS1', role: 'customer', isActive: true },
];

let notes;
let failNotifications;
let server;
let base;

test.before(async () => {
  User.findById = (id) => chain(USERS.find((u) => u._id === id) || null);
  User.find = (filter) => chain(USERS.filter((u) => matches(u, filter)));
  Conversation.findOne = () => chain(null);
  Conversation.create = async (doc) => ({ ...doc, _id: 'CONV1', save: async () => {} });
  Message.create = async (doc) => ({ ...doc, createdAt: new Date() });
  Notification.create = async (doc) => {
    if (failNotifications) throw new Error('notification store down');
    notes.push(doc);
    return doc;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/chat', require('../routes/chatRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); notes = []; failNotifications = false; });

const send = async (as, text) => {
  const user = USERS.find((u) => u._id === as);
  const token = jwt.sign({ id: as, role: user.role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/chat/conversations/mine/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }),
  });
  return { status: res.status, body: await res.json() };
};
const chatNotes = () => notes.filter((n) => n.type === 'chat_message');

test('a technician\'s message notifies every active admin, one notification each', async () => {
  const res = await send('STF1', 'The gate was locked');
  assert.equal(res.status, 201);
  assert.deepEqual(chatNotes().map((n) => n.user).sort(), ['ADM1', 'ADM2', 'ADM4']);
  chatNotes().forEach((n) => assert.match(n.message, /^New message from a technician: "The gate was locked"$/));
});

test('a customer\'s message notifies every active admin too', async () => {
  const res = await send('CUS1', 'Can you come earlier?');
  assert.equal(res.status, 201);
  assert.deepEqual(chatNotes().map((n) => n.user).sort(), ['ADM1', 'ADM2', 'ADM4']);
  chatNotes().forEach((n) => assert.match(n.message, /^New message from a customer:/));
});

test('a deactivated admin is not notified', async () => {
  await send('STF1', 'hello');
  assert.equal(chatNotes().some((n) => n.user === 'ADM3'), false);
});

test('no admin gets the same message twice', async () => {
  await send('STF1', 'only once please');
  const perAdmin = {};
  chatNotes().forEach((n) => { perAdmin[n.user] = (perAdmin[n.user] || 0) + 1; });
  assert.deepEqual(Object.values(perAdmin), [1, 1, 1]);
});

test('two messages make two notifications per admin, one for each message', async () => {
  await send('STF1', 'first');
  await send('STF1', 'second');
  assert.equal(chatNotes().length, 6);
  assert.equal(chatNotes().filter((n) => n.user === 'ADM2').length, 2);
});

test('the message is still saved and answered 201 if a notification cannot be stored', async () => {
  failNotifications = true;
  const res = await send('STF1', 'still delivered');
  assert.equal(res.status, 201);
});

test('with no active admin at all the message is still saved', async () => {
  const saved = USERS.map((u) => u.role === 'admin' ? { ...u, isActive: false } : u);
  const original = User.find;
  User.find = (filter) => chain(saved.filter((u) => matches(u, filter)));
  try {
    const res = await send('CUS1', 'anyone there?');
    assert.equal(res.status, 201);
    assert.equal(chatNotes().length, 0);
  } finally {
    User.find = original;
  }
});
