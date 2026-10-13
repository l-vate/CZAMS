// Run with: npm test (inside server/). The audit trail: what is recorded for admin actions (who, role, what, which record,
// when), that nothing sensitive can be stored, that a failed action leaves no line, that recording can never break an
// action, and that the log can be read only by an admin, newest first, paginated and filtered by Manila days. The real
// routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { authCache } = require('../utils/authCache');
const { recordAudit, cleanMeta } = require('../utils/audit');
const { readFilter } = require('../routes/auditRoutes');
const { chain } = require('./helpers/memoryQueries');
const harness = require('./helpers/createBooking');

const { state, call, addBooking } = harness;

let lines;
const settle = () => new Promise((resolve) => { setTimeout(resolve, 40); });

// ---- the helper
test('cleanMeta keeps ids and small values and drops anything sensitive', () => {
  const meta = cleanMeta({
    bookingId: 'CZ-1', amount: 500, ok: true, note: 'x'.repeat(500), password: 'p', token: 't', proofFile: '/uploads/proofs/a.png',
    bankAccount: '123', signatureDataUrl: 'data:...', nested: { reason: 'wrong booking', secretKey: 'k', list: [1, 2] }, deep: { a: { b: 1 } },
    ids: ['a', 'b', { x: 1 }], fn: () => 1,
  });
  assert.equal(meta.bookingId, 'CZ-1');
  assert.equal(meta.amount, 500);
  assert.equal(meta.note.length, 200);
  ['password', 'token', 'proofFile', 'bankAccount', 'signatureDataUrl', 'fn'].forEach((k) => assert.equal(k in meta, false, k));
  assert.deepEqual(meta.nested, { reason: 'wrong booking', list: [1, 2] });
  assert.deepEqual(meta.ids, ['a', 'b']);
  assert.equal(cleanMeta('text'), undefined);
  assert.equal(cleanMeta([1]), undefined);
});

test('recordAudit stores who, role, what, which record, and survives a failing database', async () => {
  lines = [];
  AuditLog.create = async (d) => { lines.push(d); return d; };
  User.findById = () => chain({ name: 'Admin One' });
  await recordAudit({ actor: { id: 'ADM1', role: 'admin' }, action: 'booking.approve', entityType: 'Booking', entityId: 'CZ-1', summary: 'Approved', meta: { password: 'x', ok: 1 } });
  assert.deepEqual({ actor: lines[0].actor, action: lines[0].action, entityType: lines[0].entityType, entityId: lines[0].entityId, meta: lines[0].meta },
    { actor: { id: 'ADM1', name: 'Admin One', role: 'admin' }, action: 'booking.approve', entityType: 'Booking', entityId: 'CZ-1', meta: { ok: 1 } });
  AuditLog.create = async () => { throw new Error('database down'); };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await recordAudit({ actor: { id: 'ADM1', role: 'admin', name: 'A' }, action: 'x.y', entityType: 'Booking' }), null);
  } finally {
    console.error = originalError;
  }
});

// ---- the routes that record
test.describe('recording through the routes', () => {
  const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
  test.before(async () => {
    await harness.install();
    AuditLog.create = async (d) => { lines.push(d); return d; };
  });
  test.after(() => harness.close());
  test.beforeEach(() => {
    lines = [];
    harness.reset({
      users: [
        { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer One' },
        { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
      ],
      services: [cleaning],
    });
    User.findById = (id) => chain(state.users.find((u) => u._id === id) || null);
  });
  const booking = (over = {}) => addBooking({
    bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }],
    downPaymentPercent: 50, paymentStatus: 'to_verify', proofFile: '/uploads/proofs/a.png', balancePaymentStatus: 'None', ...over,
  });
  const admin = (body) => call('PATCH', '/CZ-1/admin-update', 'ADM1', body, { role: 'admin' });

  test('verifying a payment records who did it, as an admin, against the booking', async () => {
    booking();
    assert.equal((await admin({ paymentStatus: 'partially_paid' })).status, 200);
    await settle();
    assert.equal(lines.length, 1);
    assert.deepEqual({ id: lines[0].actor.id, role: lines[0].actor.role, name: lines[0].actor.name }, { id: 'ADM1', role: 'admin', name: 'Admin One' });
    assert.equal(lines[0].action, 'payment.verify');
    assert.equal(lines[0].entityType, 'Booking');
    assert.equal(lines[0].entityId, 'CZ-1');
  });

  test('one request that does several things records each: charges and an instruction change', async () => {
    booking();
    await admin({ distanceAdjustment: 300, technicianInstructions: 'Use the side gate' });
    await settle();
    assert.deepEqual(lines.map((l) => l.action).sort(), ['booking.charges', 'booking.instructions']);
    assert.equal(lines.find((l) => l.action === 'booking.charges').meta.distanceAdjustment, 300);
    assert.equal(JSON.stringify(lines).includes('side gate'), false, 'the instructions text itself is not copied');
  });

  test('a refused action records nothing', async () => {
    booking({ proofFile: undefined });
    assert.equal((await admin({ paymentStatus: 'partially_paid' })).status, 400);
    assert.equal((await admin({ paymentStatus: 'bogus' })).status, 400);
    await settle();
    assert.deepEqual(lines, []);
  });

  test('a customer cancelling is recorded with the customer as the actor and the role', async () => {
    booking({ status: 'Pending' });
    assert.equal((await call('PATCH', '/CZ-1/cancel', 'CUS1')).status, 200);
    await settle();
    const line = lines.find((l) => l.action === 'booking.cancel');
    assert.ok(line);
    assert.deepEqual({ id: line.actor.id, role: line.actor.role, by: line.meta.by }, { id: 'CUS1', role: 'customer', by: 'customer' });
  });

  test('an admin cancelling is recorded with their id and role, not just "admin"', async () => {
    booking({ status: 'Pending' });
    await admin({ status: 'Cancelled' });
    await settle();
    const line = lines.find((l) => l.action === 'booking.cancel');
    assert.deepEqual({ id: line.actor.id, role: line.actor.role }, { id: 'ADM1', role: 'admin' });
  });

  test('recording an in-person payment is on the trail with the method and amount, not the reference text', async () => {
    booking({ paymentStatus: 'Unpaid', proofFile: undefined });
    await call('PATCH', '/CZ-1/record-payment', 'ADM1', { track: 'down', method: 'Cash', amount: 1000, reference: 'SECRET-REF' }, { role: 'admin' });
    await settle();
    const line = lines.find((l) => l.action === 'payment.record');
    assert.deepEqual(line.meta, { track: 'down', method: 'Cash', amount: 1000 });
    assert.equal(JSON.stringify(lines).includes('SECRET-REF'), false);
  });

  test('every audited route name is in the trail list', () => {
    const specs = require('../utils/auditSpecs');
    ['adminUpdate', 'recordPayment', 'customerCancel', 'rescheduleApprove', 'rescheduleDeny', 'assign', 'discountApprove', 'discountReject',
      'refundProcess', 'refundFlagResolve', 'userCreate', 'userUpdate', 'userClassification', 'settingsUpdate', 'promoCreate', 'promoUpdate',
      'promoDelete', 'serviceCreate', 'serviceUpdate', 'serviceRemove', 'announcementCreate', 'closureCreate', 'reportEdit', 'reportDelete',
      'disruptionReschedule', 'extensionApprove', 'extensionDeny'].forEach((name) => assert.equal(typeof specs[name], 'function', name));
  });
});

// ---- reading the log
test.describe('reading the log', () => {
  let server;
  let base;
  let rows;
  let lastFilter;
  const token = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const get = async (query, as = 'ADM1', role = 'admin') => {
    const res = await fetch(`${base}/api/audit-log${query}`, { headers: { Authorization: `Bearer ${token(as, role)}` } });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  test.before(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-a-real-one';
    User.findById = (id) => chain({ _id: id, role: id === 'ADM1' ? 'admin' : 'customer', isActive: true });
    AuditLog.find = (filter) => {
      lastFilter = filter;
      const q = { sort() { return q; }, skip(n) { q.s = n; return q; }, limit(n) { q.l = n; return q; }, lean: async () => rows.slice(q.s, q.s + q.l) };
      return q;
    };
    AuditLog.countDocuments = async () => rows.length;
    const app = express();
    app.use('/api/audit-log', require('../routes/auditRoutes'));
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.after(() => server && server.close());
  test.beforeEach(() => {
    authCache.clear();
    rows = Array.from({ length: 60 }, (_, i) => ({ _id: `a${i}`, action: 'payment.verify', entityType: 'Booking', createdAt: new Date(2026, 9, 1, 0, 60 - i) }));
  });

  test('only an admin can read it', async () => {
    assert.equal((await get('', 'CUS1', 'customer')).status, 403);
    assert.equal((await get('')).status, 200);
  });

  test('it is paginated: 25 a page by default, a cap of 100, and the page count', async () => {
    const first = await get('');
    assert.equal(first.body.items.length, 25);
    assert.equal(first.body.total, 60);
    assert.equal(first.body.pages, 3);
    assert.equal((await get('?page=3')).body.items.length, 10);
    assert.equal((await get('?limit=1000')).body.limit, 100);
    assert.equal((await get('?limit=0')).body.limit, 25);
  });

  test('the date range is whole Manila days: from 00:00 to 23:59:59.999 Manila, both ends included', () => {
    const { filter } = readFilter({ from: '2026-10-01', to: '2026-10-02' });
    assert.equal(filter.createdAt.$gte.toISOString(), '2026-09-30T16:00:00.000Z');
    assert.equal(filter.createdAt.$lte.toISOString(), '2026-10-02T15:59:59.999Z');
  });

  test('filters are plain text only: an operator, a bad date or an unknown record type is a 400', async () => {
    for (const query of ['?from=yesterday', '?to=2026-02-31', '?from=2026-10-05&to=2026-10-01', '?entityType=Nope', '?action=a b']) {
      assert.equal((await get(query)).status, 400, query);
    }
    // the way operators are written in a query string is never turned into an object, so it cannot reach the database
    for (const query of ['?action[$ne]=x', '?actor[$gt]=', '?entityId[$ne]=1', '?action=payment.verify&action=booking.approve']) {
      const res = await get(query);
      assert.ok([200, 400].includes(res.status), query);
      assert.equal(JSON.stringify(lastFilter || {}).includes('$ne'), false, query);
      assert.equal(JSON.stringify(lastFilter || {}).includes('$gt'), false, query);
    }
    const ok = await get('?action=payment.verify&entityType=Booking&actor=ADM1&entityId=CZ-1');
    assert.equal(ok.status, 200);
    assert.deepEqual(lastFilter, { 'actor.id': 'ADM1', action: 'payment.verify', entityType: 'Booking', entityId: 'CZ-1' });
  });
});
