// Run with: npm test (inside server/). What a technician sees of a back job visit, how the dashboard counts it, and
// how its service report is linked to the original job. The real routes and the real auth middleware run in a tiny
// Express app; only the database calls are stubbed, so no database is needed.
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
const { authCache } = require('../utils/authCache');
const { matches, chain } = require('./helpers/memoryQueries');

const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff', T7: 'staff', T8: 'staff' };
const NAMES = { T1: 'Tech One', T2: 'Tech Two', T7: 'Original Lead', T8: 'Original Helper' };

let DB;
let CLAIMS;
let REPORTS;
let saved;
let server;
let base;

const booking = (over = {}) => {
  const b = {
    bookingId: 'CZ-1', customer: { _id: 'CUS1', name: 'Customer One', phone: '0917', email: 'one@x.com' }, service: { _id: 'S1', name: 'Repair', serviceType: 'Repair' },
    status: 'Approved', date: '2026-10-20', time: 'Morning', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }],
    isBackJob: false, backJobId: null, units: [], paymentStatus: 'paid', proofFile: '/uploads/proofs/p.png', refund: {},
    technicianInstructions: 'ORIGINAL JOB NOTE', ...over,
  };
  b.save = async () => b;
  b.populate = async () => b;
  b.toObject = () => b;
  return b;
};

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.find = (f) => {
    const ids = f?._id?.$in || [];
    return chain(ids.filter((id) => NAMES[id]).map((id) => ({ _id: id, name: NAMES[id] })));
  };
  User.findOne = () => chain({ _id: 'ADM1' });
  Booking.find = (f) => chain(DB.filter((d) => matches(d, f)));
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  BackJob.find = (f) => chain(CLAIMS.filter((c) => matches(c, f)));
  BackJob.findOne = (f) => chain(CLAIMS.find((c) => matches(c, f)) || null);
  Report.find = (f) => chain(REPORTS.filter((r) => matches(r, f)));
  Report.findOne = (f) => chain(REPORTS.find((r) => matches(r, f)) || null);
  Report.prototype.save = async function save() { saved = this; return this; };
  Notification.create = async (d) => d;

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test.beforeEach(() => {
  authCache.clear();
  saved = null;
  // the original job (done by T7 and T8), its report, and the claim; then the free repair visit for T1 and T2
  const original = booking({ bookingId: 'CZ-0', status: 'Completed', date: '2026-09-01', time: 'Afternoon', technician: 'T7', assignments: [{ lead: 'T7', helper: 'T8' }] });
  const visit = booking({ bookingId: 'CZ-5', isBackJob: true, backJobId: 'BJ-1', status: 'Approved', date: '2026-10-22' });
  DB = [original, visit];
  CLAIMS = [{ backJobId: 'BJ-1', originalBookingId: 'CZ-0', originalBooking: 'x', customer: 'CUS1', issueDescription: 'leaks again', status: 'Scheduled' }];
  REPORTS = [{
    _id: '64b64c1f1c1f1c1f1c1f1c1f', bookingId: 'CZ-0', technicianId: 'T7', workSummary: 'Replaced the drain hose', issueResolution: 'Complete', submittedAt: '2026-09-01T10:00:00Z',
    preExistingIssue: { flagged: true, description: 'Old compressor' }, signedFormPhoto: '/uploads/proofs/sig.png', clientConsent: { signedName: 'Customer One' },
  }];
});

const call = async (method, path, as, body = {}) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: method === 'GET' ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ---- what the technician sees
['T1', 'T2'].forEach((tech) => {
  test(`${tech === 'T1' ? 'the lead' : 'the helper'} on a back job visit sees it is one, with the original job's reference, date, technicians and report summary`, async () => {
    const res = await call('GET', '/api/bookings/technician/mine', tech);
    assert.equal(res.status, 200);
    const visit = res.body.find((j) => j.bookingId === 'CZ-5');
    assert.equal(visit.isBackJob, true);
    assert.equal(visit.backJobId, 'BJ-1');
    assert.equal(visit.backJob.backJobId, 'BJ-1');
    assert.equal(visit.backJob.original.bookingId, 'CZ-0');
    assert.equal(visit.backJob.original.date, '2026-09-01');
    assert.equal(visit.backJob.original.time, 'Afternoon');
    assert.deepEqual(visit.backJob.original.technicians, [{ name: 'Original Lead', role: 'Lead' }, { name: 'Original Helper', role: 'Helper' }]);
    assert.equal(visit.backJob.originalReport.workSummary, 'Replaced the drain hose');
    assert.equal(visit.backJob.originalReport.issueResolution, 'Complete');
    assert.equal(visit.backJob.originalReport.preExistingIssue.flagged, true);
  });
});

test('the back job information is whitelisted: nothing about the original customer, money, proofs, photos or notes', async () => {
  const res = await call('GET', '/api/bookings/technician/mine', 'T1');
  const visit = res.body.find((j) => j.bookingId === 'CZ-5');
  assert.deepEqual(Object.keys(visit.backJob).sort(), ['backJobId', 'original', 'originalReport']);
  assert.deepEqual(Object.keys(visit.backJob.original).sort(), ['bookingId', 'date', 'technicians', 'time']);
  assert.deepEqual(Object.keys(visit.backJob.originalReport).sort(), ['issueResolution', 'preExistingIssue', 'submittedAt', 'workSummary']);
  const text = JSON.stringify(visit.backJob);
  ['sig.png', 'Customer One', 'ORIGINAL JOB NOTE', 'proofs', 'paymentStatus', 'one@x.com', '64b64c1f1c1f1c1f1c1f1c1f', 'T7', 'T8'].forEach((needle) => {
    assert.equal(text.includes(needle), false, `the back job context must not contain ${needle}`);
  });
});

test('an ordinary booking has no back job information', async () => {
  DB.push(booking({ bookingId: 'CZ-6', date: '2026-10-23' }));
  const res = await call('GET', '/api/bookings/technician/mine', 'T1');
  const regular = res.body.find((j) => j.bookingId === 'CZ-6');
  assert.equal(regular.isBackJob, false);
  assert.equal('backJob' in regular, false);
});

test('a back job whose original has no report shows the reference and date, and no summary', async () => {
  REPORTS = [];
  const res = await call('GET', '/api/bookings/technician/mine', 'T1');
  const visit = res.body.find((j) => j.bookingId === 'CZ-5');
  assert.equal(visit.backJob.original.bookingId, 'CZ-0');
  assert.equal(visit.backJob.originalReport, null);
});

test('a back job visit that is still Pending stays hidden from the technician, as every Pending booking is', async () => {
  DB[1].status = 'Pending';
  const res = await call('GET', '/api/bookings/technician/mine', 'T1');
  assert.equal(res.body.some((j) => j.bookingId === 'CZ-5'), false);
});

// ---- the dashboard counts
test('back jobs are kept out of the regular totals and counted on their own', async () => {
  DB = [
    booking({ bookingId: 'R1', status: 'Completed', assignments: [{ lead: 'T1', helper: 'T2' }] }),
    booking({ bookingId: 'R2', status: 'Completed', assignments: [{ lead: 'T1', helper: 'T2' }] }),
    booking({ bookingId: 'R3', status: 'In Progress', assignments: [{ lead: 'T1', helper: 'T2' }] }),
    booking({ bookingId: 'R4', status: 'Approved', assignments: [{ lead: 'T1', helper: 'T2' }] }),
    booking({ bookingId: 'B1', isBackJob: true, backJobId: 'BJ-1', status: 'Completed' }),
    booking({ bookingId: 'B2', isBackJob: true, backJobId: 'BJ-2', status: 'In Progress' }),
    booking({ bookingId: 'B3', isBackJob: true, backJobId: 'BJ-3', status: 'Approved' }),
  ];
  REPORTS = [{ bookingId: 'R1' }, { bookingId: 'R2' }];
  const res = await call('GET', '/api/bookings/technician/mine/stats', 'T1');
  assert.equal(res.status, 200);
  assert.equal(res.body.completed, 2, 'regular completed jobs only');
  assert.equal(res.body.ongoing, 2, 'regular Approved and In Progress only');
  assert.equal(res.body.pendingReports, 1, 'only the regular In Progress job waits for a report');
  assert.deepEqual(res.body.backJobs, { ongoing: 2, completed: 1 });
});

test('a technician with no back jobs gets zeros, not a missing field', async () => {
  DB = [booking({ bookingId: 'R1', status: 'Completed' })];
  const res = await call('GET', '/api/bookings/technician/mine/stats', 'T1');
  assert.deepEqual(res.body.backJobs, { ongoing: 0, completed: 0 });
  assert.equal(res.body.completed, 1);
});

// ---- the report
const reportBody = (over = {}) => ({
  bookingId: 'CZ-5', workSummary: 'Fixed the leak again', clientConsentSignedName: 'Customer One', clientConsentSignatureDataUrl: 'data:image/png;base64,AAAA', ...over,
});

test('a report on a back job visit records the link to the claim, the original booking and the original report', async () => {
  DB[1].status = 'In Progress';
  const res = await call('POST', '/api/reports', 'T1', reportBody());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(saved.backJob.backJobId, 'BJ-1');
  assert.equal(saved.backJob.originalBookingId, 'CZ-0');
  assert.equal(String(saved.backJob.originalReportId), '64b64c1f1c1f1c1f1c1f1c1f');
});

test('if the original job had no report, the link still records the claim and the original booking', async () => {
  DB[1].status = 'In Progress';
  REPORTS = [];
  const res = await call('POST', '/api/reports', 'T1', reportBody());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(saved.backJob.originalBookingId, 'CZ-0');
  assert.equal(saved.backJob.originalReportId, undefined);
});

test('a report on an ordinary booking has no back job link', async () => {
  DB.push(booking({ bookingId: 'CZ-6', status: 'In Progress' }));
  const res = await call('POST', '/api/reports', 'T1', reportBody({ bookingId: 'CZ-6' }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(saved.backJob.backJobId, undefined);
  assert.equal(saved.backJob.originalBookingId, undefined);
});
