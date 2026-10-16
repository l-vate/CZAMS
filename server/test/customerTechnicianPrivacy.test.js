// Run with: npm test (inside server/). A customer never receives a technician's id, email, phone or the internal parts
// of a service report, in any response that can embed a technician: the booking list and details, the service report,
// and the back job claim with its free visit. Technicians appear by display name only. The real routes and the real
// auth middleware run in a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const { authCache } = require('../utils/authCache');
const { toCustomerReport, toCustomerBackJob } = require('../utils/customerView');
const { matches, chain } = require('./helpers/memoryQueries');
const { PNG_DATA_URL } = require('./helpers/signature');

const accounts = { CUS1: 'customer', CUS2: 'customer' };
const LEAD_ID = 'STF9001';
const HELPER_ID = 'STF9002';
const SECRETS = [LEAD_ID, HELPER_ID, 'lead.private@example.com', '0917000111', 'internal note', 'gate code', '7.5'];
const FORBIDDEN_KEYS = ['technicianId', 'email', 'laborHours', 'notes', 'technicianInstructions', 'submittedBy', 'password', 'phone'];

// every key at any depth
const keysDeep = (value, found = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, found));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { found.add(k); keysDeep(v, found); });
  return found;
};
const assertNoTechnicianData = (body, label) => {
  const text = JSON.stringify(body);
  SECRETS.forEach((secret) => assert.equal(text.includes(secret), false, `${label} must not contain ${secret}`));
  const keys = keysDeep(body);
  FORBIDDEN_KEYS.forEach((key) => {
    // the customer's own name, phone and email may appear under the customer object; check technician places only
    assert.equal(keys.has(key) && key !== 'phone' && key !== 'email', false, `${label} must not have a ${key} key`);
  });
};

const lead = { _id: LEAD_ID, name: 'Lead Tech', email: 'lead.private@example.com', phone: '0917000111' };
const helper = { _id: HELPER_ID, name: 'Helper Tech', email: 'helper.private@example.com', phone: '0917000222' };

const makeBooking = (over = {}) => {
  const b = {
    _id: 'oid-1', bookingId: 'CZ-1', customer: 'CUS1', service: { name: 'Cleaning', serviceType: 'Cleaning' },
    status: 'Completed', date: '2026-10-01', time: 'Morning', address: 'Somewhere', technician: lead,
    assignments: [{ lead, helper }], technicianInstructions: 'gate code 1234', extensionDays: [], ...over,
  };
  b.populate = () => b;
  b.toObject = () => JSON.parse(JSON.stringify(b));
  return b;
};
const makeReport = () => {
  const r = {
    _id: 'R1', bookingId: 'CZ-1', booking: 'oid-1', technicianId: LEAD_ID, workSummary: 'Cleaned both units', partsUsed: 'None', recommendations: 'Clean again in 3 months',
    issueResolution: 'Complete', laborHours: 7.5, followUpRequired: true, followUpDate: '2026-12-01', notes: 'internal note', submittedBy: LEAD_ID, isFinal: true,
    submittedAt: '2026-10-01T05:00:00Z', preExistingIssue: { flagged: true, description: 'Old leak', extra: 'x' },
    clientConsent: { signedName: 'Customer One', signedAt: '2026-10-01T05:01:00Z', signatureDataUrl: PNG_DATA_URL, ip: '1.2.3.4' },
    signedFormPhoto: '/uploads/proofs/abc.png', backJob: { backJobId: 'BJ-1' },
  };
  r.toObject = () => JSON.parse(JSON.stringify(r));
  return r;
};

let DB;
let REPORT;
let server;
let base;

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.findOne = (f) => chain({ _id: f && f._id, name: 'Lead Tech', email: 'lead.private@example.com' });
  Booking.find = (f) => chain(DB.filter((d) => matches(d, f)));
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  Booking.findById = () => chain(DB[0]);
  Report.findOne = () => chain(REPORT);
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); DB = [makeBooking()]; REPORT = makeReport(); });

const get = async (path, as = 'CUS1') => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('the service report for the owning customer is the whitelist, with technician names only', async () => {
  const res = await get('/api/reports/booking/CZ-1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertNoTechnicianData(res.body, 'report');
  assert.deepEqual(res.body.technicians.sort(), ['Helper Tech', 'Lead Tech']);
  assert.equal(res.body.workSummary, 'Cleaned both units');
  assert.equal(res.body.issueResolution, 'Complete');
  assert.equal(res.body.recommendations, 'Clean again in 3 months');
  assert.equal(res.body.followUpRequired, true);
  assert.equal(res.body.preExistingIssue.description, 'Old leak');
  assert.equal(res.body.clientConsent.signedName, 'Customer One');
  assert.equal(res.body.clientConsent.signatureDataUrl, PNG_DATA_URL);
  assert.equal(res.body.signedFormPhoto, '/uploads/proofs/abc.png');
  assert.equal(res.body.serviceDate, '2026-10-01');
  assert.equal(res.body.clientConsent.ip, undefined, 'unlisted consent fields stay out');
  assert.equal(res.body.backJob, undefined);
  assert.equal(res.body.isFinal, undefined);
});

test('the report whitelist is exactly these top-level fields', () => {
  const out = toCustomerReport(makeReport(), makeBooking(), ['A']);
  assert.deepEqual(Object.keys(out).sort(), [
    '_id', 'bookingDetails', 'bookingId', 'clientConsent', 'followUpDate', 'followUpRequired', 'issueResolution', 'partsUsed',
    'preExistingIssue', 'recommendations', 'serviceDate', 'signedFormPhoto', 'submittedAt', 'technicians', 'workSummary',
  ]);
});

test('the booking list and the booking details show technicians by name only', async () => {
  const list = await get('/api/bookings/mine');
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assertNoTechnicianData(list.body, 'GET /mine');
  assert.equal(list.body[0].assignments[0].lead.name, 'Lead Tech');
  assert.deepEqual(Object.keys(list.body[0].assignments[0].lead), ['name']);
  const one = await get('/api/bookings/CZ-1');
  assert.equal(one.status, 200, JSON.stringify(one.body));
  assertNoTechnicianData(one.body, 'GET /:bookingId');
  assert.deepEqual(Object.keys(one.body.technician), ['name']);
});

test('a technician that was not populated (an id only) shows as nobody, never as the id', () => {
  const out = require('../utils/customerView').toCustomerView(makeBooking({ technician: LEAD_ID, assignments: [{ lead: LEAD_ID, helper: HELPER_ID }] }));
  assert.equal(out.technician, null);
  assert.deepEqual(out.assignments, [{ team: null, lead: null, helper: null }]);
  assert.equal(JSON.stringify(out).includes(LEAD_ID), false);
});

test('a back job claim with its free visit carries no technician id or contact', () => {
  const claim = { backJobId: 'BJ-1', originalBookingId: 'CZ-0', customer: 'CUS1', issueDescription: 'leak', status: 'Scheduled', reviewedBy: 'ADM1', resultingBooking: makeBooking({ isBackJob: true }) };
  assertNoTechnicianData(toCustomerBackJob(claim), 'back job');
});

test('another customer cannot read the report', async () => {
  assert.equal((await get('/api/reports/booking/CZ-1', 'CUS2')).status, 403);
});
