// Run with: npm test (inside server/). Warranty dates are worked out in Philippine time, so a server in any time
// zone gives the same answer, and a report that is deleted and filed again restarts the clock. The zone checks run
// the real code in separate Node processes, each with its own TZ. The report routes run in a tiny Express app with
// only the database calls stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');
const { getWarrantyStatus, addDays, addMonths, addYears } = require('../utils/warranty');
const { matches, chain } = require('./helpers/memoryQueries');

const WARRANTY_MODULE = path.join(__dirname, '..', 'utils', 'warranty.js').replace(/\\/g, '/');
const ZONES = ['UTC', 'Asia/Manila', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata'];

// Runs a small script in a fresh Node process whose time zone is `tz`, and returns what it printed.
function inZone(tz, script) {
  const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${tz}: ${result.stderr}`);
  return result.stdout.trim();
}

const expiry = (completedAtIso, service, extra = '') => `
  const { getWarrantyStatus } = require('${WARRANTY_MODULE}');
  const w = getWarrantyStatus({ status: 'Completed', completedAt: new Date('${completedAtIso}'), service: ${JSON.stringify(service)} ${extra} });
  console.log(JSON.stringify({ w: w.workmanship && w.workmanship.expiresAt, c: w.unit && w.unit.compressorExpiresAt, m: w.unit && w.unit.minorPartsExpiresAt }));
`;

// ---- the example from the audit: completed 2026-08-31 20:00 UTC (1 September 04:00 in Manila), 6 months
test('completed 2026-08-31 20:00 UTC with a 6-month warranty ends at the end of 1 March 2027 in Manila, on a server in any time zone', () => {
  const outputs = ZONES.map((tz) => inZone(tz, expiry('2026-08-31T20:00:00Z', { serviceType: 'Installation' }, ', clientSuppliedUnit: false')));
  const first = JSON.parse(outputs[0]);
  assert.equal(first.w, '2027-03-01T15:59:59.999Z'); // 2027-03-01 23:59:59.999 in Manila
  outputs.forEach((o, i) => assert.equal(o, outputs[0], `${ZONES[i]} gives a different answer`));
});

test('the same example in Manila terms: the warranty covers the whole last day', () => {
  const w = getWarrantyStatus({ status: 'Completed', completedAt: new Date('2026-08-31T20:00:00Z'), service: { serviceType: 'Installation' }, clientSuppliedUnit: false });
  const inManila = new Date(w.workmanship.expiresAt.getTime() + 8 * 3600000).toISOString();
  assert.equal(inManila, '2027-03-01T23:59:59.999Z'); // read as Manila wall-clock time: 1 March 2027, one millisecond before midnight
});

test('every warranty length gives the same answer in every time zone', () => {
  const cases = [
    ['2026-10-05T10:00:00Z', { serviceType: 'Cleaning' }, ''],
    ['2026-01-31T20:00:00Z', { serviceType: 'Leak Repair' }, ''],
    ['2026-02-28T17:00:00Z', { serviceType: 'Installation' }, ', clientSuppliedUnit: true'],
    ['2024-02-29T01:00:00Z', { serviceType: 'Installation' }, ', clientSuppliedUnit: false'],
    ['2026-12-31T16:30:00Z', { serviceType: 'Cleaning' }, ''],
  ];
  cases.forEach(([completed, service, extra]) => {
    const outputs = ZONES.map((tz) => inZone(tz, expiry(completed, service, extra)));
    outputs.forEach((o, i) => assert.equal(o, outputs[0], `${completed} ${service.serviceType} in ${ZONES[i]}`));
  });
});

// ---- the calendar rules, from fixed instants
const manila = (iso) => new Date(new Date(iso).getTime() + 8 * 3600000).toISOString();

test('days are counted in Manila calendar days and end at the end of the last day', () => {
  // completed Monday 5 October 2026 18:00 Manila (10:00 UTC): 7 days is the end of Monday 12 October
  assert.equal(addDays(new Date('2026-10-05T10:00:00Z'), 7).toISOString(), '2026-10-12T15:59:59.999Z');
  // completed at 00:30 on 6 October in Manila (16:30 UTC on the 5th): still the 6th in Manila
  assert.equal(addDays(new Date('2026-10-05T16:30:00Z'), 7).toISOString(), '2026-10-13T15:59:59.999Z');
  assert.equal(manila(addDays(new Date('2026-10-05T16:30:00Z'), 7).toISOString()), '2026-10-13T23:59:59.999Z');
});

test('a month with no such day ends on the last day of that month, never in the next one', () => {
  assert.equal(manila(addMonths(new Date('2026-08-30T10:00:00Z'), 6).toISOString()), '2027-02-28T23:59:59.999Z'); // 30 Aug + 6 months
  assert.equal(manila(addMonths(new Date('2027-08-31T10:00:00Z'), 6).toISOString()), '2028-02-29T23:59:59.999Z'); // leap year
  assert.equal(manila(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()), '2026-02-28T23:59:59.999Z');
  assert.equal(manila(addMonths(new Date('2026-03-15T10:00:00Z'), 12).toISOString()), '2027-03-15T23:59:59.999Z');
  assert.equal(manila(addMonths(new Date('2026-11-20T10:00:00Z'), 3).toISOString()), '2027-02-20T23:59:59.999Z'); // across the new year
});

test('years: 29 February plus 5 years is 28 February in a year with no leap day', () => {
  assert.equal(manila(addYears(new Date('2024-02-29T10:00:00Z'), 5).toISOString()), '2029-02-28T23:59:59.999Z');
  assert.equal(manila(addYears(new Date('2024-02-29T10:00:00Z'), 4).toISOString()), '2028-02-29T23:59:59.999Z');
  assert.equal(manila(addYears(new Date('2026-06-10T10:00:00Z'), 1).toISOString()), '2027-06-10T23:59:59.999Z');
});

test('the warranty is active until the very last millisecond of the last day, then not', () => {
  const completedAt = new Date('2026-10-05T10:00:00Z');
  const w = getWarrantyStatus({ status: 'Completed', completedAt, service: { serviceType: 'Cleaning' } });
  const end = w.workmanship.expiresAt.getTime();
  const RealDate = Date;
  const at = (ms) => {
    global.Date = class extends RealDate { constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(ms); } static now() { return ms; } };
    try { return getWarrantyStatus({ status: 'Completed', completedAt, service: { serviceType: 'Cleaning' } }).workmanship.active; } finally { global.Date = RealDate; }
  };
  assert.equal(at(end), true);
  assert.equal(at(end + 1), false);
  assert.equal(at(end - 3600000), true);
});

// ---- deleting a report and filing a new one
const accounts = { ADM1: 'admin', CUS1: 'customer', T1: 'staff', T2: 'staff' };
let booking;
let reports;
let notes;
let server;
let base;

const makeBooking = (over = {}) => {
  const b = {
    bookingId: 'CZ-1', customer: 'CUS1', service: { _id: 'S1', name: 'Cleaning', serviceType: 'Cleaning' }, status: 'Completed', date: '2026-10-05', time: 'Morning',
    technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], reportSubmitted: true, reportId: 'rid', completedAt: new Date('2026-10-05T10:00:00Z'), ...over,
  };
  b.save = async () => b;
  b.populate = async () => b;
  return b;
};

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.findOne = () => chain({ _id: 'T1', role: 'staff' });
  Booking.findOne = (f) => chain(booking && matches(booking, f) ? booking : null);
  // an update with $set and $unset, applied to the in-memory booking
  Booking.updateOne = async (f, update) => {
    Object.assign(booking, update.$set || {});
    Object.keys(update.$unset || {}).forEach((k) => delete booking[k]);
    return {};
  };
  Report.findById = (id) => chain(reports.find((r) => String(r._id) === String(id)) || null);
  Report.findOne = (f) => chain(reports.find((r) => r.bookingId === f.bookingId) || null);
  Report.prototype.save = async function save() { reports.push(this); return this; };
  Report.deleteOne = async () => ({});
  Notification.create = async (d) => { notes.push(d); return d; };

  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); notes = []; });

const call = async (method, p, as, body = {}) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: method === 'GET' ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const reportBody = { bookingId: 'CZ-1', workSummary: 'Cleaned the unit', issueResolution: 'Complete', laborHours: 2, followUpRequired: false, clientConsentSignedName: 'Customer One', clientConsentSignatureDataUrl: 'data:image/png;base64,AAAA' };
const existingReport = () => {
  const report = new Report({ bookingId: 'CZ-1', booking: '64b64c1f1c1f1c1f1c1f1c1f', technicianId: 'T1', workSummary: 'first' });
  report.deleteOne = async () => ({}); // the route deletes through the document
  return report;
};

test('deleting a report puts the job back In Progress, clears the completion time and tells the lead', async () => {
  booking = makeBooking({ paymentDueAt: new Date('2026-10-12T00:00:00Z') });
  const report = existingReport();
  reports = [report];
  const res = await call('DELETE', `/api/reports/${report._id}`, 'ADM1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(booking.status, 'In Progress', 'a job with no report is not Completed');
  assert.equal(booking.reportSubmitted, false);
  assert.equal('completedAt' in booking, false, 'the old completion time is cleared');
  assert.equal('paymentDueAt' in booking, false);
  assert.equal('reportId' in booking, false);
  const told = notes.filter((n) => n.type === 'report_removed');
  assert.deepEqual(told.map((n) => n.user), ['T1'], 'only the lead is told, once');
  assert.match(told[0].message, /removed by the admin/);
  assert.match(told[0].message, /In Progress again/);
  assert.equal(told[0].relatedBookingId, 'CZ-1');
});

test('the new report after a deletion starts the clock again: completedAt is the new submission time', async () => {
  booking = makeBooking();
  const report = existingReport();
  reports = [report];
  await call('DELETE', `/api/reports/${report._id}`, 'ADM1');
  reports = [];
  const before = Date.now();
  const res = await call('POST', '/api/reports', 'T1', reportBody);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(booking.status, 'Completed');
  assert.ok(booking.completedAt.getTime() >= before, 'completedAt is the new time, not 2026-10-05');
  assert.notEqual(booking.completedAt.toISOString(), '2026-10-05T10:00:00.000Z');
});

test('the warranty then runs from the new completion time', async () => {
  booking = makeBooking();
  const report = existingReport();
  reports = [report];
  await call('DELETE', `/api/reports/${report._id}`, 'ADM1');
  reports = [];
  await call('POST', '/api/reports', 'T1', reportBody);
  const w = getWarrantyStatus({ ...booking, status: 'Completed' });
  const expected = addDays(booking.completedAt, 7);
  assert.equal(w.workmanship.expiresAt.getTime(), expected.getTime());
  assert.ok(w.workmanship.expiresAt.getTime() > Date.now(), 'covered from the new time');
});

test('a job left In Progress with an old completion time (from before this fix) gets a fresh one when its report is filed', async () => {
  booking = makeBooking({ status: 'In Progress', reportSubmitted: false, reportId: undefined, completedAt: new Date('2026-01-01T00:00:00Z') });
  reports = [];
  const before = Date.now();
  const res = await call('POST', '/api/reports', 'T1', reportBody);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(booking.completedAt.getTime() >= before);
});

test('a job that was already Completed before reports were required keeps its completion time when its report is filed', async () => {
  const done = new Date('2026-01-01T00:00:00Z');
  booking = makeBooking({ status: 'Completed', reportSubmitted: false, reportId: undefined, completedAt: done });
  reports = [];
  const res = await call('POST', '/api/reports', 'T1', reportBody);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(booking.completedAt.getTime(), done.getTime());
});

test('only an admin can delete a report', async () => {
  booking = makeBooking();
  const report = existingReport();
  reports = [report];
  assert.equal((await call('DELETE', `/api/reports/${report._id}`, 'T1')).status, 403);
  assert.equal(booking.status, 'Completed');
});
