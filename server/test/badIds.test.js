// Run with: npm test (inside server/). A malformed id in an address is a 400 "Invalid id" (for the routes whose id is a MongoDB ObjectId) or a
// 404 (for the routes whose id is plain text, such as a booking id), never a 500, and the answer never carries a stack trace. The routes are
// found by reading every router, so a route added later is covered without editing this file. The real routes, the real auth and the real
// error handler run; only the database is replaced. The models with an ObjectId _id throw a real CastError for a bad id, like MongoDB does,
// so a route that forgot to check would show up here as a 500.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const { authCache } = require('../utils/authCache');
const { errorHandler, requestId } = require('../middleware/errorHandler');
const { chain } = require('./helpers/memoryQueries');
const { installLockStub } = require('./helpers/stubLocks');

const MOUNTS = {
  '/api/bookings': 'bookingRoutes', '/api/reports': 'reportRoutes', '/api/notifications': 'notificationRoutes', '/api/promos': 'promoRoutes',
  '/api/chat': 'chatRoutes', '/api/announcements': 'announcementRoutes', '/api/services': 'serviceRoutes', '/api/users': 'userRoutes',
  '/api/backjobs': 'backJobRoutes', '/api/closures': 'closureRoutes', '/api/files': 'fileRoutes', '/api/auth': 'authRoutes',
  '/api/service-reminders': 'serviceReminderRoutes', '/api/payment-settings': 'paymentSettingsRoutes', '/api/audit-log': 'auditRoutes',
  '/api/availability': 'availabilityRoutes', '/api/teams': 'teamRoutes',
};
const OBJECT_ID_MODELS = new Set(['Report', 'Notification', 'Promo', 'Conversation', 'Message']);
const STATICS = ['find', 'findOne', 'findById', 'findByIdAndUpdate', 'findByIdAndDelete', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'exists', 'aggregate', 'distinct', 'create', 'insertMany', 'bulkWrite'];
const BAD = ['not-an-id', 'zzz', '123', '%00', '<script>alert(1)</script>', 'x'.repeat(200), '..%2F..%2Fetc'];
const WELL_FORMED = '64b64c1f1c1f1c1f1c1f1c1f';

let server;
let base;
const reached = [];

const castError = (value) => new mongoose.Error.CastError('ObjectId', value, '_id');
const validId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

test.before(async () => {
  installLockStub();
  const modelsDir = path.join(__dirname, '..', 'models');
  fs.readdirSync(modelsDir).filter((f) => f.endsWith('.js')).forEach((file) => {
    const Model = require(path.join(modelsDir, file));
    const name = Model.modelName;
    STATICS.forEach((method) => {
      Model[method] = (...args) => {
        reached.push(`${name}.${method}`);
        // a lookup by a bad ObjectId is a CastError in MongoDB
        if (OBJECT_ID_MODELS.has(name) && ['findById', 'findByIdAndUpdate', 'findByIdAndDelete'].includes(method) && !validId(String(args[0]))) {
          return chain(Promise.reject(castError(args[0])));
        }
        if (OBJECT_ID_MODELS.has(name) && method === 'findOne' && args[0] && args[0]._id !== undefined && !validId(String(args[0]._id))) {
          return chain(Promise.reject(castError(args[0]._id)));
        }
        if (['find', 'aggregate', 'distinct', 'insertMany'].includes(method)) return chain([]);
        if (method === 'countDocuments') return Promise.resolve(0);
        return chain(null);
      };
    });
  });
  User.findById = (id) => chain(id === 'ADM1' ? { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' } : null);

  const app = express();
  app.use(requestId);
  app.use(express.json());
  Object.entries(MOUNTS).forEach(([mount, file]) => app.use(mount, require(`../routes/${file}`)));
  app.use(errorHandler);
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(() => authCache.clear());

const token = jwt.sign({ id: 'ADM1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '10m' });

// every route that has a parameter in its address, found from the routers themselves
function routesWithParams() {
  const out = [];
  Object.entries(MOUNTS).forEach(([mount, file]) => {
    const router = require(`../routes/${file}`);
    (router.stack || []).forEach((layer) => {
      if (!layer.route || !layer.route.path.includes(':')) return;
      Object.keys(layer.route.methods).forEach((method) => out.push({ method: method.toUpperCase(), template: `${mount}${layer.route.path}`, file }));
    });
  });
  return out;
}

const fill = (template, value) => template.replace(/:[A-Za-z]+/g, encodeURIComponent(value).replace(/%252F/gi, '%2F'));
const send = async (method, url) => {
  const res = await fetch(`${base}${url}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify({ reason: 'Test reason for removing it' }) });
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};
const leaks = (text) => /\bat [\w$.<> ]+ \(|node_modules|[A-Za-z]:\\|CastError|Cast to ObjectId|MongoServerError/i.test(text);

const ROUTES = routesWithParams();

test('every route with an id in its address was found', () => {
  assert.ok(ROUTES.length >= 50, `only ${ROUTES.length} routes found`);
  ['/api/reports/:id', '/api/notifications/:id/read', '/api/promos/:id', '/api/chat/conversations/:id/messages', '/api/bookings/:bookingId/pay'].forEach((t) => {
    assert.ok(ROUTES.some((r) => r.template === t), `${t} is not among the routes`);
  });
});

test('a malformed id never gives a 500 or a stack trace on any route that has one', async () => {
  const problems = [];
  let sent = 0;
  for (const { method, template } of ROUTES) {
    for (const value of BAD) {
      const url = fill(template, value);
      const res = await send(method, url);
      sent += 1;
      if (res.status >= 500) problems.push(`${method} ${template} with "${value.slice(0, 20)}" answered ${res.status}`);
      else if (leaks(res.text)) problems.push(`${method} ${template} leaked internals`);
      else if (!res.json) problems.push(`${method} ${template} did not answer in JSON (${res.status})`);
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(sent > 300, `${sent} requests were sent`);
});

test('the routes whose id is an ObjectId answer 400 "Invalid id" for a malformed one, before the database is asked', async () => {
  const objectIdRoutes = ROUTES.filter((r) => ['reportRoutes', 'notificationRoutes', 'promoRoutes'].includes(r.file) && r.template.endsWith(':id') || r.template.endsWith(':id/read') || r.template.includes('/conversations/:id'));
  assert.ok(objectIdRoutes.length >= 8, `${objectIdRoutes.length} routes`);
  reached.length = 0;
  for (const { method, template } of objectIdRoutes) {
    for (const value of ['not-an-id', 'zzz', '123']) {
      const res = await send(method, fill(template, value));
      assert.equal(res.status, 400, `${method} ${template} with ${value}: ${res.text}`);
      assert.deepEqual(res.json, { message: 'Invalid id' });
    }
  }
  assert.deepEqual(reached.filter((r) => /findById|findOne/.test(r) && /Report|Notification|Promo|Conversation/.test(r)), [], 'the database was not asked');
});

test('a well-formed id that matches nothing is a 404, not a 500', async () => {
  for (const [method, url] of [
    ['GET', `/api/reports/${WELL_FORMED}`],
    ['DELETE', `/api/reports/${WELL_FORMED}`],
    ['PATCH', `/api/notifications/${WELL_FORMED}/read`],
    ['DELETE', `/api/promos/${WELL_FORMED}`],
    ['GET', `/api/chat/conversations/${WELL_FORMED}/messages`],
  ]) {
    const res = await send(method, url);
    assert.equal(res.status, 404, `${method} ${url}: ${res.status} ${res.text}`);
  }
});

test('the two ids from the audit pass: GET /api/reports/not-an-id and PATCH /api/notifications/zzz/read', async () => {
  const a = await send('GET', '/api/reports/not-an-id');
  const b = await send('PATCH', '/api/notifications/zzz/read');
  assert.deepEqual([a.status, b.status], [400, 400]);
  assert.deepEqual([a.json.message, b.json.message], ['Invalid id', 'Invalid id']);
});

test('the global error handler also turns a CastError that a route did not catch into a 400', async () => {
  const handler = errorHandler;
  const sent = {};
  const res = { headersSent: false, status(code) { sent.code = code; return this; }, json(body) { sent.body = body; return this; } };
  handler(castError('zzz'), { id: 'x', method: 'GET', path: '/x' }, res, () => {});
  assert.equal(sent.code, 400);
  assert.deepEqual(sent.body, { message: 'Invalid id' });
});
