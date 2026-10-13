// Run with: npm test (inside server/). The report sections the paper lists must each be answered on purpose:
// work summary, resolution, labor hours, and Yes or No for a follow-up. The real route and the real auth middleware
// run in a tiny Express app; only the database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { authCache } = require('../utils/authCache');
const { validateReportSections } = require('../utils/reportErrors');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = require('../utils/extensionDays');
const { chain } = require('./helpers/memoryQueries');

const TODAY = manilaTodayKey();
const FUTURE = addDays(TODAY, 5);
const PAST = addDays(TODAY, -3);
const complete = (over = {}) => ({
  workSummary: 'Cleaned the unit', issueResolution: 'Complete', laborHours: 2, followUpRequired: false, today: TODAY, ...over,
});

// ---- the rules on their own
test('a complete set of answers passes, with parts and recommendations left out', () => {
  assert.equal(validateReportSections(complete()), null);
  assert.equal(validateReportSections(complete({ laborHours: '1.5', followUpRequired: 'false' })), null);
  assert.equal(validateReportSections(complete({ followUpRequired: true, followUpDate: FUTURE })), null);
  assert.equal(validateReportSections(complete({ followUpRequired: 'true', followUpDate: TODAY })), null, 'today is not in the past');
});

test('each missing section gets its own clear message', () => {
  assert.equal(validateReportSections(complete({ workSummary: '' })).message, 'Work summary is required');
  assert.equal(validateReportSections(complete({ workSummary: '   ' })).message, 'Work summary is required');
  assert.equal(validateReportSections(complete({ workSummary: undefined })).message, 'Work summary is required');
  assert.equal(validateReportSections(complete({ issueResolution: undefined })).message, 'Choose how the issue was resolved: Complete, Partial, Unresolved.');
  assert.equal(validateReportSections(complete({ issueResolution: '' })).message, 'Choose how the issue was resolved: Complete, Partial, Unresolved.');
  assert.match(validateReportSections(complete({ laborHours: undefined })).message, /Labor hours are required/);
  assert.match(validateReportSections(complete({ laborHours: '' })).message, /Labor hours are required/);
  assert.match(validateReportSections(complete({ laborHours: null })).message, /Labor hours are required/);
  assert.equal(validateReportSections(complete({ followUpRequired: undefined })).message, 'Say whether a follow-up service is needed (Yes or No).');
});

test('every answer given is still checked: resolution, hours in steps of 0.5, follow-up date', () => {
  assert.match(validateReportSections(complete({ issueResolution: 'Bogus' })).message, /Resolution must be one of/);
  assert.match(validateReportSections(complete({ laborHours: 'abc' })).message, /from 0 to 24/);
  assert.match(validateReportSections(complete({ laborHours: -1 })).message, /from 0 to 24/);
  assert.match(validateReportSections(complete({ laborHours: 24.5 })).message, /from 0 to 24/);
  assert.match(validateReportSections(complete({ laborHours: 1.3 })).message, /steps of 0.5/);
  assert.match(validateReportSections(complete({ laborHours: '2.25' })).message, /steps of 0.5/);
  assert.equal(validateReportSections(complete({ laborHours: 0 })), null, '0 hours is a real answer');
  assert.equal(validateReportSections(complete({ laborHours: 24 })), null);
  assert.equal(validateReportSections(complete({ laborHours: 0.5 })), null);
});

test('a follow-up that is Yes needs a date that is not in the past', () => {
  assert.equal(validateReportSections(complete({ followUpRequired: true })).message, 'Follow-up date is required when follow-up is needed');
  assert.equal(validateReportSections(complete({ followUpRequired: 'true', followUpDate: '' })).message, 'Follow-up date is required when follow-up is needed');
  assert.match(validateReportSections(complete({ followUpRequired: true, followUpDate: PAST })).message, /cannot be in the past/);
  assert.match(validateReportSections(complete({ followUpRequired: true, followUpDate: 'tomorrow' })).message, /valid date/);
});

test('"maybe" and other odd answers for the follow-up are a missing answer', () => {
  ['maybe', 'yes', 'no', 1, 0, null, {}].forEach((v) => {
    assert.equal(validateReportSections(complete({ followUpRequired: v })).message, 'Say whether a follow-up service is needed (Yes or No).', String(v));
  });
});

// ---- through the real route
const accounts = { T1: 'staff' };
let booking;
let saved;
let server;
let base;

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: 'staff', isActive: true } : null);
  User.findOne = () => chain({ _id: 'T1', role: 'staff' });
  Report.findOne = () => chain(null);
  Report.prototype.save = async function save() { saved = this; return this; };
  Notification.create = async (d) => d;

  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test.beforeEach(() => {
  authCache.clear();
  saved = null;
  booking = new Booking({ bookingId: 'CZ-1', customer: 'CUS1', service: 'S1', address: 'x', status: 'In Progress', technician: 'T1', assignments: [{ lead: 'T1', helper: null }] });
  booking.save = async () => booking;
  Booking.findOne = () => chain(booking);
});

const BASE = { bookingId: 'CZ-1', workSummary: 'Cleaned the unit', clientConsentSignedName: 'Customer One', clientConsentSignatureDataUrl: 'data:image/png;base64,AAAA' };
const submit = async (body) => {
  const token = jwt.sign({ id: 'T1', role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const full = (over = {}) => ({ ...BASE, issueResolution: 'Complete', laborHours: 2, followUpRequired: false, ...over });

test('a full report is accepted, with parts and recommendations left out', async () => {
  const res = await submit(full());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(saved.partsUsed, null);
  assert.equal(saved.recommendations, null);
});

[
  ['work summary', { workSummary: '' }, /Work summary is required/],
  ['resolution', { issueResolution: undefined }, /Choose how the issue was resolved/],
  ['labor hours', { laborHours: undefined }, /Labor hours are required/],
  ['the follow-up answer', { followUpRequired: undefined }, /Say whether a follow-up service is needed/],
].forEach(([name, over, message]) => {
  test(`a report without ${name} is a 400 with a clear message, and nothing is saved`, async () => {
    const res = await submit(full(over));
    assert.equal(res.status, 400);
    assert.match(res.body.message, message);
    assert.equal(saved, null);
    assert.equal(booking.status, 'In Progress');
  });
});

test('there is no silent default: a report with no resolution is refused, not saved as Partial', async () => {
  const res = await submit(full({ issueResolution: undefined }));
  assert.equal(res.status, 400);
  assert.equal(saved, null);
});

test('the resolution chosen is the one saved, whichever it is', async () => {
  for (const resolution of ['Complete', 'Partial', 'Unresolved']) {
    saved = null;
    booking.status = 'In Progress';
    const res = await submit(full({ issueResolution: resolution }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(saved.issueResolution, resolution);
  }
});

test('0 labor hours is saved as 0, not as missing; 1.5 is saved as 1.5', async () => {
  assert.equal((await submit(full({ laborHours: 0 }))).status, 201);
  assert.equal(saved.laborHours, 0);
  booking.status = 'In Progress';
  assert.equal((await submit(full({ laborHours: '1.5' }))).status, 201);
  assert.equal(saved.laborHours, 1.5);
});

test('labor hours outside 0 to 24 or not in steps of 0.5 are refused', async () => {
  for (const hours of [-0.5, 24.5, 100, 'abc', 2.3]) {
    const res = await submit(full({ laborHours: hours }));
    assert.equal(res.status, 400, String(hours));
  }
  assert.equal(saved, null);
});

test('follow-up No saves no date; follow-up Yes saves the date and needs one that is not in the past', async () => {
  assert.equal((await submit(full({ followUpRequired: false, followUpDate: FUTURE }))).status, 201);
  assert.equal(saved.followUpRequired, false);
  assert.equal(saved.followUpDate, null);

  booking.status = 'In Progress';
  assert.equal((await submit(full({ followUpRequired: true }))).status, 400);
  assert.equal((await submit(full({ followUpRequired: true, followUpDate: PAST }))).status, 400);
  const yes = await submit(full({ followUpRequired: true, followUpDate: FUTURE }));
  assert.equal(yes.status, 201, JSON.stringify(yes.body));
  assert.equal(saved.followUpRequired, true);
  assert.equal(saved.followUpDate.toISOString().slice(0, 10), FUTURE);
});

test('the answers also work when sent as text, the way the form sends them', async () => {
  const res = await submit(full({ laborHours: '3', followUpRequired: 'true', followUpDate: FUTURE }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(saved.laborHours, 3);
  assert.equal(saved.followUpRequired, true);
});

// ---- existing reports are untouched, and the average ignores the ones with no hours
test('the average labor hours ignores old reports that have no hours, instead of counting them as 0', async () => {
  const { buildTechnicianStats } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'technicianStats.js')).href);
  const done = (id) => ({ bookingId: id, status: 'Completed', assignments: [{ lead: { _id: 'T1', name: 'Tech One' }, helper: null }] });
  const bookings = [done('A'), done('B'), done('C'), done('D')];
  const reports = [
    { bookingId: 'A', laborHours: 2 },
    { bookingId: 'B', laborHours: 4 },
    { bookingId: 'C', laborHours: null }, // an old report with no hours
    { bookingId: 'D' }, // an old report where the field does not exist
  ];
  const [row] = buildTechnicianStats(bookings, reports);
  assert.equal(row.completedJobs, 4);
  assert.equal(row.avgTime, 3, '(2 + 4) / 2, not (2 + 4 + 0 + 0) / 4');
});

test('a report with 0 hours counts as 0 in the average, because 0 is a real answer now', async () => {
  const { buildTechnicianStats } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'technicianStats.js')).href);
  const done = (id) => ({ bookingId: id, status: 'Completed', assignments: [{ lead: { _id: 'T1', name: 'Tech One' }, helper: null }] });
  const [row] = buildTechnicianStats([done('A'), done('B')], [{ bookingId: 'A', laborHours: 0 }, { bookingId: 'B', laborHours: 4 }]);
  assert.equal(row.avgTime, 2);
});

test('the report model still reads an old report with no hours, so old reports are untouched', () => {
  const old = new Report({ bookingId: 'CZ-0', booking: '64b64c1f1c1f1c1f1c1f1c1f', technicianId: 'T1', workSummary: 'old' });
  assert.equal(old.laborHours, undefined);
  assert.equal(old.validateSync(), undefined);
});
