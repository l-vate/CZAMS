// Run with: npm test (inside server/). What a customer may see of a booking: a whitelist, checked on the helper
// and on every route a customer can call. The real routes and the real auth middleware run in a tiny Express app;
// only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const Closure = require('../models/Closure');
const TechnicianOff = require('../models/TechnicianOff');
const { authCache } = require('../utils/authCache');
const { toCustomerView, toCustomerBackJob, PASS_THROUGH, SHAPED, HIDDEN } = require('../utils/customerView');
const { matches, chain } = require('./helpers/memoryQueries');
const { PNG_DATA_URL } = require('./helpers/signature');

// ---- the whitelist itself
const SECRET_TEXT = 'INTERNAL: gate code 4821, owner is difficult, do not mention the discount';
const ADMIN_NAME = 'Admin Reviewer Name';

const fat = () => ({
  _id: 'mongo1', bookingId: 'CZ-1', customer: 'CUS1', status: 'Approved', date: '2026-10-20', time: 'Morning',
  address: '1 Test St', contactNumber: '0917', problemDescription: 'not cooling',
  service: { _id: 'S1', name: 'Cleaning', serviceType: 'Cleaning', price: 800 },
  units: [{ type: 'Split Type', quantity: 2, brandModel: 'Carrier', _id: 'u1' }],
  technician: { _id: 'T1', name: 'Tech One', email: 'secret@x.com' },
  assignments: [{ team: null, lead: { _id: 'T1', name: 'Tech One', email: 'a@b.c' }, helper: { _id: 'T2', name: 'Tech Two' } }],
  requestedTechnician: 'T1',
  technicianInstructions: SECRET_TEXT,
  assignmentHistory: [{ changedBy: 'ADM1', reason: 'because the owner asked', previous: [], next: [] }],
  queueRank: 1000, approvedAt: '2026-09-01T00:00:00Z', serviceAreaCheck: { withinArea: false, adminReviewed: false },
  reportId: 'r1', report: { workSummary: 'old' }, __v: 0,
  paymentStatus: 'paid', paymentMode: 'GCash', downPaymentPercent: 50, proofFile: '/uploads/proofs/p.png',
  discount: { type: 'Senior', idFile: '/uploads/proofs/id.jpg', status: 'Rejected', rejectionReason: 'ID is blurry', reviewedBy: { _id: 'ADM1', name: ADMIN_NAME }, reviewedAt: '2026-09-02T00:00:00Z', percent: 20 },
  refund: {
    status: 'Processed', downPaymentAmount: 500, refundableAmount: 500, computedAmount: 500, finalAmount: 400, adjustmentReason: 'Dispatch cost deducted',
    processedBy: 'ADM1', adjustedBy: 'ADM1', adjustedAt: '2026-09-03T00:00:00Z', proofFile: '/uploads/proofs/r.png',
    customerFlag: { flagged: true, message: 'not received', flaggedAt: '2026-09-04T00:00:00Z', resolved: true, resolvedBy: 'ADM1' },
  },
  disruption: { status: 'Reported', reason: 'TECHNICIAN REASON part missing', reportedBy: 'T1' },
  extensionRequest: { status: 'Approved', reason: 'TECHNICIAN REASON more time', requestedBy: 'T1', decidedBy: 'ADM1', decidedAt: '2026-09-05T00:00:00Z' },
  extensionDays: [{ date: '2026-10-21', time: 'Morning', approvedBy: 'ADM1', approvedAt: '2026-09-05T00:00:00Z' }],
  rescheduleRequest: { status: 'Pending', requestedDate: '2026-10-25', requestedTime: 'Afternoon' },
  feedback: { rating: 5, text: 'great' }, promo: { name: 'Promo', amount: 100 },
});

const FORBIDDEN_KEYS = [
  'technicianInstructions', 'assignmentHistory', 'queueRank', 'serviceAreaCheck', 'reportId', 'report', '__v',
  'reviewedBy', 'processedBy', 'adjustedBy', 'adjustedAt', 'resolvedBy', 'reportedBy', 'requestedBy', 'decidedBy', 'approvedBy', 'changedBy', 'email',
];
const FORBIDDEN_VALUES = [SECRET_TEXT, ADMIN_NAME, 'gate code', 'because the owner asked', 'TECHNICIAN REASON', 'ADM1', 'secret@x.com'];

function allKeys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { found.add(k); allKeys(v, found); });
  return found;
}

const assertClean = (value, label) => {
  // approvedAt is the admin's first-approval time at the top of a booking; inside an approved extra day it is fine
  [].concat(value).forEach((v) => assert.equal(v && typeof v === 'object' && 'approvedAt' in v, false, `${label}: top-level approvedAt`));
  const keys = allKeys(value);
  assert.deepEqual(FORBIDDEN_KEYS.filter((k) => keys.has(k)), [], `${label}: forbidden keys`);
  const text = JSON.stringify(value);
  FORBIDDEN_VALUES.forEach((v) => assert.equal(text.includes(v), false, `${label}: leaked ${v}`));
};

test('the customer view has none of the internal keys or values, at any depth', () => {
  assertClean(toCustomerView(fat()), 'toCustomerView');
});

test('the customer view keeps everything the customer screens use', () => {
  const v = toCustomerView(fat());
  assert.equal(v.bookingId, 'CZ-1');
  assert.equal(v.service.name, 'Cleaning');
  assert.deepEqual(v.units, [{ type: 'Split Type', quantity: 2, brandModel: 'Carrier', _id: 'u1' }]);
  assert.deepEqual(v.technician, { name: 'Tech One' }); // the name only: a customer never receives a technician id (E4-2)
  assert.equal(v.assignments[0].lead.name, 'Tech One');
  assert.equal(v.assignments[0].helper.name, 'Tech Two');
  assert.equal(v.discount.rejectionReason, 'ID is blurry'); // the customer's screen shows why it was not approved
  assert.equal(v.refund.adjustmentReason, 'Dispatch cost deducted'); // and why a refund was adjusted
  assert.equal(v.refund.customerFlag.flagged, true);
  assert.equal(v.refund.finalAmount, 400);
  assert.equal(v.extensionRequest.status, 'Approved');
  assert.deepEqual(v.extensionDays, [{ date: '2026-10-21', time: 'Morning', approvedAt: '2026-09-05T00:00:00Z' }]);
  assert.equal(v.rescheduleRequest.requestedDate, '2026-10-25');
  assert.equal(v.paymentStatus, 'paid');
});

test('a field added to the booking later stays hidden until it is whitelisted', () => {
  const v = toCustomerView({ ...fat(), someNewInternalNote: 'x', nested: { deep: 'y' } });
  assert.equal('someNewInternalNote' in v, false);
  assert.equal('nested' in v, false);
});

test('every field of the Booking model is classified: shown, shaped, or hidden (a new field must be decided)', () => {
  const fields = [...new Set(Object.keys(Booking.schema.paths).map((p) => p.split('.')[0]))];
  const known = new Set([...PASS_THROUGH, ...SHAPED, ...HIDDEN]);
  const unclassified = fields.filter((f) => !known.has(f));
  assert.deepEqual(unclassified, [], 'decide for each new Booking field whether a customer may see it, in utils/customerView.js');
});

test('a back job claim does not show who reviewed it, and its free visit uses the customer view', () => {
  const claim = {
    backJobId: 'BJ-1', originalBookingId: 'CZ-0', issueDescription: 'leaking', status: 'Reviewed', reviewedBy: 'ADM1', reviewedAt: '2026-09-09T00:00:00Z',
    resultingBooking: fat(), resultingBookingId: 'CZ-1',
  };
  const v = toCustomerBackJob(claim);
  assertClean(v, 'back job');
  assert.equal(v.backJobId, 'BJ-1');
  assert.equal(v.resultingBooking.bookingId, 'CZ-1');
});

// ---- every route a customer can call
const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff' };
let DB;
let REPORTS;
let CLAIMS;
let server;
let base;

const doc = (over = {}) => {
  const b = { ...fat(), ...over };
  b.save = async () => b;
  b.populate = async () => b;
  b.toObject = () => {
    const copy = { ...b };
    ['save', 'populate', 'toObject'].forEach((k) => delete copy[k]);
    return JSON.parse(JSON.stringify(copy));
  };
  return b;
};

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  require('./helpers/stubLocks').installLockStub(); // moving a Pending booking now takes the slot's lock
  // two free pairs of technicians, so the new slot is open
  User.find = (f) => chain(f && f.role === 'staff' ? ['TA', 'TB', 'TC', 'TD'].map((id) => ({ _id: id, name: id, role: 'staff', isActive: true, position: 'Technician' })) : []);
  User.findOne = () => chain({ _id: 'ADM1' });
  Booking.find = (f) => chain(DB.filter((d) => matches(d, f)));
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  Booking.findOneAndUpdate = (f, update) => {
    const found = DB.find((d) => matches(d, f));
    if (found) Object.assign(found, update.$set);
    return chain(found || null);
  };
  Booking.updateOne = async () => ({});
  Report.findOne = (f) => chain(REPORTS.find((r) => r.bookingId === f.bookingId) || null);
  BackJob.findOne = (f) => chain(CLAIMS.find((c) => matches(c, f)) || null);
  Notification.create = async (d) => d;
  Closure.findOne = () => chain(null);
  Closure.find = () => chain([]);
  TechnicianOff.find = () => chain([]);

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  app.use('/api/reports', require('../routes/reportRoutes'));
  app.use('/api/backjobs', require('../routes/backJobRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); DB = []; REPORTS = []; CLAIMS = []; });

const call = async (method, path, as, body = {}) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: method === 'GET' ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('GET /bookings/mine returns the customer view', async () => {
  DB = [doc(), doc({ bookingId: 'CZ-2' })];
  const res = await call('GET', '/api/bookings/mine', 'CUS1');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assertClean(res.body, 'GET /mine');
  assert.equal(res.body[0].service.name, 'Cleaning');
});

test('GET /bookings/:id returns the customer view', async () => {
  DB = [doc()];
  const res = await call('GET', '/api/bookings/CZ-1', 'CUS1');
  assert.equal(res.status, 200);
  assertClean(res.body, 'GET /:id');
  assert.equal(res.body.bookingId, 'CZ-1');
});

test('PATCH cancel returns the customer view', async () => {
  DB = [doc({ status: 'Pending', refund: undefined, paymentStatus: 'unpaid' })];
  const res = await call('PATCH', '/api/bookings/CZ-1/cancel', 'CUS1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertClean(res.body, 'PATCH /cancel');
});

test('PATCH reschedule returns the customer view', async () => {
  DB = [doc({ status: 'Pending', rescheduleRequest: undefined })];
  // about ten days ahead, never a Sunday (the shop is closed, so the server would refuse it and the test would depend on the weekday it runs)
  const date = new Date(Date.now() + 10 * 86400000);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const res = await call('PATCH', '/api/bookings/CZ-1/reschedule', 'CUS1', { date: day, time: 'Afternoon' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertClean(res.body, 'PATCH /reschedule');
});

test('PATCH feedback returns the customer view', async () => {
  DB = [doc({ status: 'Completed', feedback: undefined })];
  const res = await call('PATCH', '/api/bookings/CZ-1/feedback', 'CUS1', { rating: 5, text: 'great' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertClean(res.body, 'PATCH /feedback');
});

test('PATCH refund flag and refund received return the customer view', async () => {
  DB = [doc({ status: 'Cancelled', refund: { ...fat().refund, customerFlag: undefined, receivedConfirmedAt: undefined } })];
  const flag = await call('PATCH', '/api/bookings/CZ-1/refund/flag', 'CUS1', { message: 'not received' });
  assert.equal(flag.status, 200, JSON.stringify(flag.body));
  assertClean(flag.body, 'PATCH /refund/flag');
  DB = [doc({ status: 'Cancelled', refund: { ...fat().refund, customerFlag: undefined, receivedConfirmedAt: undefined } })];
  const received = await call('PATCH', '/api/bookings/CZ-1/refund/received', 'CUS1');
  assert.equal(received.status, 200, JSON.stringify(received.body));
  assertClean(received.body, 'PATCH /refund/received');
});

// a payment submission the way the form sends it: a proof file and a reference number
const callPay = async (path, as) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const png = Buffer.from(PNG_DATA_URL.split(',')[1], 'base64');
  const form = new FormData();
  form.append('referenceNumber', '1234567890123');
  form.append('proof', new Blob([png], { type: 'image/png' }), 'proof.png');
  const res = await fetch(`${base}${path}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('PATCH pay and pay-balance return the customer view', async () => {
  const fileStore = require('../storage/fileStore');
  fileStore.setStore(fileStore.createMemoryStore());
  DB = [doc({ status: 'Pending', paymentMode: 'GCash', paymentMode2: 'Bank Transfer', paymentStatus: 'Unpaid', balancePaymentStatus: 'None' })];
  const pay = await callPay('/api/bookings/CZ-1/pay', 'CUS1');
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  assertClean(pay.body, 'PATCH /pay');
  Object.assign(DB[0], { paymentStatus: 'partially_paid', status: 'Approved' }); // approved and the down payment verified, so a balance is due
  const balance = await callPay('/api/bookings/CZ-1/pay-balance', 'CUS1');
  assert.equal(balance.status, 200, JSON.stringify(balance.body));
  assertClean(balance.body, 'PATCH /pay-balance');
});

test('the report route gives the owning customer the customer view of the booking', async () => {
  DB = [doc({ status: 'Completed' })];
  REPORTS = [new Report({ bookingId: 'CZ-1', booking: '64b64c1f1c1f1c1f1c1f1c1f', technicianId: 'T1', workSummary: 'done' })];
  const original = Booking.findById;
  Booking.findById = () => chain(DB[0]);
  try {
    const res = await call('GET', '/api/reports/booking/CZ-1', 'CUS1');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertClean(res.body.bookingDetails, 'GET /reports/booking as customer');
  } finally {
    Booking.findById = original;
  }
});

test('a back job claim read by its customer has no reviewer and a clean free visit', async () => {
  CLAIMS = [{ backJobId: 'BJ-1', originalBookingId: 'CZ-0', customer: 'CUS1', issueDescription: 'leak', status: 'Scheduled', reviewedBy: 'ADM1', resultingBooking: doc(),
    toObject() { return { ...this, resultingBooking: this.resultingBooking.toObject() }; } }];
  const res = await call('GET', '/api/backjobs/booking/CZ-0', 'CUS1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertClean(res.body, 'GET /backjobs/booking');
  assert.equal(res.body.backJobId, 'BJ-1');
});

test('notifications carry no booking contents, only the message and a reference', () => {
  const fields = Object.keys(Notification.schema.paths).filter((f) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(f)).sort();
  assert.deepEqual(fields, ['message', 'read', 'readAt', 'relatedBooking', 'relatedBookingId', 'type', 'user']);
});

test('chat messages carry text and, when a customer attached one of their own bookings, a short card snapshot and nothing else of the booking', () => {
  const Message = require('../models/Message');
  const fields = Object.keys(Message.schema.paths).filter((f) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(f)).sort();
  assert.deepEqual(fields, ['bookingRef', 'conversationId', 'senderId', 'senderRole', 'text']);
  // the snapshot is only what the card shows: no address, phone, payment, proof or ID photo
  assert.deepEqual(Object.keys(Message.schema.path('bookingRef').schema.paths).filter((f) => f !== '_id').sort(),
    ['bookingId', 'items', 'placed', 'service', 'status', 'total', 'when']);
});

// ---- the technician still sees the instructions
['Approved', 'In Progress'].forEach((status) => {
  ['T1', 'T2'].forEach((tech) => {
    test(`the ${tech === 'T1' ? 'lead' : 'helper'} still sees the admin's instructions on a ${status} job`, async () => {
      // as stored in the database: plain technician ids, not populated names
      DB = [doc({ status, technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }] })];
      const res = await call('GET', '/api/bookings/technician/mine', tech);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].technicianInstructions, SECRET_TEXT);
    });
  });
});
