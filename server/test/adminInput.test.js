// Run with: npm test (inside server/). Admin writes are checked on the server: accounts (role in the list, a real email that
// is unique in any letter case, a phone, a password of at least 8 characters, a real true or false), services (a positive
// price within a limit, a known type, text limits, consistent flags), announcements. A refusal is a 400 (or a 409 for a
// duplicate) that names the field, never a 500. A global error handler answers in JSON with no stack trace. The real
// routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-a-real-one';

const User = require('../models/User');
const Service = require('../models/Service');
const Announcement = require('../models/Announcement');
const AuditLog = require('../models/AuditLog');
const Booking = require('../models/Booking');
const { authCache } = require('../utils/authCache');
const { userInputProblem, serviceInputProblem, announcementInputProblem } = require('../utils/adminInput');
const { requestId, apiNotFound, errorHandler } = require('../middleware/errorHandler');
const { chain } = require('./helpers/memoryQueries');

// ---- the rules on their own
test('a good account passes; each bad field has its own message', () => {
  const ok = { name: 'Ana Cruz', email: 'Ana@Example.com', phone: '0917 123 4567', role: 'staff', password: 'longenough1', isActive: true };
  assert.equal(userInputProblem(ok, { creating: true }), null);
  const msg = (over) => userInputProblem({ ...ok, ...over }, { creating: true }).message;
  assert.match(msg({ role: 'superuser' }), /role must be one of/);
  assert.match(msg({ role: ['admin'] }), /role must be one of/);
  assert.match(msg({ email: 'nope' }), /valid email/);
  assert.match(msg({ email: undefined }), /Email is required/);
  assert.match(msg({ email: { $ne: '' } }), /Email is required/);
  assert.match(msg({ phone: 'abc' }), /contact number/);
  assert.match(msg({ password: 'short' }), /at least 8 characters/);
  assert.match(msg({ password: 12345678 }), /at least 8 characters/);
  assert.match(msg({ isActive: 'false' }), /true or false/);
  assert.match(msg({ isActive: 0 }), /true or false/);
  assert.match(msg({ name: 42 }), /name must be text/);
  assert.match(msg({ clientType: 'Corporate' }), /Residential or Commercial/);
});

test('an update does not need an email, but one that is sent must be real; no password is fine', () => {
  assert.equal(userInputProblem({ isActive: false }, { creating: false }), null);
  assert.equal(userInputProblem({ name: 'New Name', phone: '' }, { creating: false }), null);
  assert.match(userInputProblem({ email: '' }, { creating: false }).message, /Email is required/);
});

test('a service needs a positive price within the limit, a known type and sane text', () => {
  const ok = serviceInputProblem({ name: ' Cleaning ', price: '800', serviceType: 'Cleaning', unitTypePricing: [{ unitType: 'Split Type', price: 900 }] }, { creating: true });
  assert.equal(ok.problem, null);
  assert.equal(ok.values.name, 'Cleaning');
  assert.equal(ok.values.price, 800);
  const bad = (body, opts = { creating: true }) => serviceInputProblem({ name: 'X', price: 100, ...body }, opts).problem;
  [0, -5, 'free', null, undefined, NaN, 1000001, {}].forEach((price) => assert.ok(bad({ price }), String(price)));
  assert.match(bad({ serviceType: 'Magic' }).message, /service type must be one of/);
  assert.match(bad({ name: 'x'.repeat(81) }).message, /80 characters/);
  assert.match(bad({ description: 'x'.repeat(1001) }).message, /1000 characters/);
  assert.match(bad({ durationMinutes: 2000 }).message, /duration/);
  assert.match(bad({ isActive: 'yes' }).message, /true or false/);
  assert.match(bad({ unitTypePricing: [{ unitType: 'Split Type', price: -1 }] }).message, /greater than 0/);
  assert.match(bad({ unitTypePricing: [{ unitType: 'Split Type', price: 5 }, { unitType: 'Split Type', price: 6 }] }).message, /listed twice/);
  assert.match(bad({ unitTypePricing: 'many' }).message, /list/);
});

test('only a Cleaning service can be hidden as a tier', () => {
  assert.equal(serviceInputProblem({ name: 'Deep', price: 1, serviceType: 'Cleaning', hiddenFromDirectSelection: true }, { creating: true }).problem, null);
  assert.match(serviceInputProblem({ name: 'Other', price: 1, serviceType: 'Repair', hiddenFromDirectSelection: true }, { creating: true }).problem.message, /Only a Cleaning service/);
  assert.match(serviceInputProblem({ hiddenFromDirectSelection: true }, { creating: false, current: { serviceType: 'Repair' } }).problem.message, /Only a Cleaning service/);
  assert.equal(serviceInputProblem({ hiddenFromDirectSelection: true }, { creating: false, current: { serviceType: 'Cleaning' } }).problem, null);
});

test('announcements: lengths, a known category, a real true or false', () => {
  assert.equal(announcementInputProblem({ title: 'Closed', message: 'We are closed', category: 'Holiday' }, { creating: true }), null);
  assert.match(announcementInputProblem({ title: '', message: 'x' }, { creating: true }).message, /Title is required/);
  assert.match(announcementInputProblem({ title: 'x'.repeat(101), message: 'x' }, { creating: true }).message, /100 characters/);
  assert.match(announcementInputProblem({ title: 'x', message: 'x'.repeat(1001) }, { creating: true }).message, /1000 characters/);
  assert.match(announcementInputProblem({ title: 'x', message: 'x', category: 'Gossip' }, { creating: true }).message, /category must be one of/);
  assert.match(announcementInputProblem({ isActive: 'no' }, { creating: false }).message, /true or false/);
  assert.equal(announcementInputProblem({ title: '  ' }, { creating: false }).status, 400);
});

// ---- through the real routes
test.describe('the routes', () => {
  let server;
  let base;
  let users;
  let services;
  let announcements;

  const token = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const send = async (method, path, body, as = 'ADM1') => {
    const res = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(as, as.startsWith('ADM') ? 'admin' : 'customer')}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  test.before(async () => {
    AuditLog.create = async () => ({});
    User.findById = (id) => chain(users.find((u) => u._id === id) || null);
    User.findOne = (f) => chain(users.find((u) => (f.email instanceof RegExp ? f.email.test(u.email) : u.email === f.email) && !(f._id && f._id.$ne === u._id)) || null);
    User.countDocuments = async (f) => users.filter((u) => u.role === f.role && u.isActive !== false && u._id !== (f._id && f._id.$ne)).length;
    User.create = async (d) => { const u = { ...d, toObject() { return { ...this }; } }; users.push(u); return u; };
    User.findByIdAndUpdate = (id, update) => {
      const u = users.find((x) => x._id === id);
      if (u) Object.assign(u, update);
      return chain(u ? { ...u, toObject() { return { ...u }; } } : null);
    };
    Service.findById = (id) => chain(services.find((s) => s._id === id) || null);
    Service.create = async (d) => { services.push(d); return d; };
    Service.findByIdAndUpdate = (id, update) => { const s = services.find((x) => x._id === id); if (s) Object.assign(s, update); return chain(s || null); };
    Announcement.create = async (d) => { announcements.push(d); return d; };
    Booking.countDocuments = async () => 0;
    const app = express();
    app.use(requestId);
    app.use(express.json());
    app.use('/api/users', require('../routes/userRoutes'));
    app.use('/api/services', require('../routes/serviceRoutes'));
    app.use('/api/announcements', require('../routes/announcementRoutes'));
    app.use((req, res, next) => (req.path === '/boom' ? next(new Error('database password is hunter2 at C:\\secret\\file.js')) : next()));
    app.use(apiNotFound);
    app.use(errorHandler);
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.after(() => server && server.close());
  test.beforeEach(() => {
    authCache.clear();
    users = [
      { _id: 'ADM1', role: 'admin', isActive: true, email: 'admin@example.com', name: 'Admin One' },
      { _id: 'CUS1', role: 'customer', isActive: true, email: 'Bea@Example.com', name: 'Bea' },
    ];
    services = [{ _id: 'S1', name: 'Cleaning', serviceType: 'Cleaning', price: 800 }];
    announcements = [];
  });

  test('creating an account with a bad role, email, phone or password is a 400, and nothing is created', async () => {
    for (const body of [{ email: 'a@b.co', role: 'owner' }, { email: 'nope', role: 'staff' }, { email: 'a@b.co', phone: 'abc' }, { email: 'a@b.co', password: 'short' }, { role: 'staff' }]) {
      const res = await send('POST', '/users', body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(users.length, 2);
  });

  test('a duplicate email, in any letter case, is a 409 on create and on update', async () => {
    assert.equal((await send('POST', '/users', { email: 'BEA@example.com', role: 'staff' })).status, 409);
    users.push({ _id: 'STF1', role: 'staff', isActive: true, email: 'tech@example.com' });
    assert.equal((await send('PUT', '/users/STF1', { email: 'bea@EXAMPLE.com' })).status, 409);
    assert.equal((await send('PUT', '/users/STF1', { email: 'tech@example.com' })).status, 200, 'its own email is fine');
  });

  test('a good account is created with a lower case email and a generated password handed back once', async () => {
    const res = await send('POST', '/users', { name: ' Tech One ', email: ' Tech@Example.COM ', role: 'staff', position: 'Technician' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(users[2].email, 'tech@example.com');
    assert.equal(users[2].name, 'Tech One');
    assert.ok(res.body.generatedPassword);
  });

  test('isActive must be a real true or false, so the last-admin guard cannot be skipped with the text "false"', async () => {
    const text = await send('PUT', '/users/CUS1', { isActive: 'false' });
    assert.equal(text.status, 400);
    assert.equal(users[1].isActive, true);
    const guard = await send('PUT', '/users/ADM1', { isActive: false });
    assert.equal(guard.status, 400, 'an admin cannot deactivate themselves');
    users.push({ _id: 'ADM2', role: 'admin', isActive: true, email: 'two@example.com' });
    assert.equal((await send('PUT', '/users/ADM1', { isActive: false }, 'ADM2')).status, 200, 'with another active admin it is allowed');
    assert.match((await send('PUT', '/users/ADM2', { isActive: false }, 'ADM2')).body.message, /cannot deactivate your own account|last active admin/);
  });

  test('a bad role on update is a 400, not a 500', async () => {
    assert.equal((await send('PUT', '/users/CUS1', { role: 'god' })).status, 400);
    assert.equal((await send('PUT', '/users/CUS1', { email: 42 })).status, 400);
  });

  test('a service with a price of 0, a huge price or a bad type is a 400 that names the problem', async () => {
    for (const body of [{ name: 'X', price: 0 }, { name: 'X', price: 5000000 }, { name: 'X', price: 10, serviceType: 'Magic' }, { price: 10 }]) {
      const res = await send('POST', '/services', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.message.length > 5);
    }
    assert.equal(services.length, 1);
    assert.equal((await send('POST', '/services', { name: 'Check-up', price: 500, serviceType: 'Check-up' })).status, 201);
    assert.equal((await send('PUT', '/services/S1', { price: -1 })).status, 400);
    assert.equal((await send('PUT', '/services/S1', { price: 900 })).status, 200);
    assert.equal(services[0].price, 900);
    assert.equal((await send('PUT', '/services/NOPE', { price: 900 })).status, 404);
  });

  test('announcements: a long title or an unknown category is a 400', async () => {
    assert.equal((await send('POST', '/announcements', { title: 'x'.repeat(101), message: 'm' })).status, 400);
    assert.equal((await send('POST', '/announcements', { title: 't', message: 'm', category: 'Gossip' })).status, 400);
    assert.equal((await send('POST', '/announcements', { title: 't', message: 'm', category: 'Holiday' })).status, 201);
  });

  test('a customer cannot use any of them', async () => {
    assert.equal((await send('POST', '/users', { email: 'a@b.co' }, 'CUS1')).status, 403);
    assert.equal((await send('POST', '/services', { name: 'x', price: 1 }, 'CUS1')).status, 403);
    assert.equal((await send('POST', '/announcements', { title: 't', message: 'm' }, 'CUS1')).status, 403);
  });

  // ---- the error handler
  test('a request body that is not JSON is a JSON 400, not an error page', async () => {
    const res = await fetch(`${base}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('ADM1', 'admin')}` }, body: '{"email": ' });
    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type'), /json/);
    assert.equal((await res.json()).message, 'The request body is not valid JSON.');
  });

  test('an unexpected error is a generic JSON 500 with a request id, and no message, stack or path leaves the server', async () => {
    const logged = [];
    const originalError = console.error;
    console.error = (...args) => logged.push(args.join(' '));
    try {
      for (const env of ['production', 'development']) {
        process.env.NODE_ENV = env;
        const res = await fetch(`${base}/boom`, { headers: { Authorization: `Bearer ${token('ADM1', 'admin')}` } });
        assert.equal(res.status, 500);
        const text = await res.text();
        const body = JSON.parse(text);
        assert.equal(body.message, 'Server error');
        assert.match(body.requestId, /^[0-9a-f]{8}$/);
        assert.equal(res.headers.get('x-request-id'), body.requestId);
        ['hunter2', 'secret', 'file.js', 'at ', 'Error:'].forEach((leak) => assert.equal(text.includes(leak), false, `${env} leaks ${leak}`));
      }
    } finally {
      console.error = originalError;
      process.env.NODE_ENV = 'test';
    }
    assert.ok(logged.some((line) => line.includes('hunter2')), 'the real message is in the server log, with the request id');
    assert.ok(logged.every((line) => /\[request [0-9a-f]{8}\]/.test(line)));
  });

  test('an unknown /api address is a JSON 404', async () => {
    const res = await fetch(`${base}/api/nothing-here`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).message, 'Not found');
  });
});
