// Run with: npm test (inside server/). An admin editing a service report follows the same rules as filing one (a bad
// resolution is a 400). Deleting one needs a reason, removes its photo file, tells the lead, and is refused (409) while a
// back job claim depends on it or the booking is already fully paid. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const BackJob = require('../models/BackJob');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { authCache } = require('../utils/authCache');
const { createMemoryStore, setStore } = require('../storage/fileStore');
const { chain } = require('./helpers/memoryQueries');

// report ids are MongoDB ObjectIds: a text id is refused as malformed before the route looks anything up
const R1 = '64b64c1f1c1f1c1f1c1f1c01';
const R2 = '64b64c1f1c1f1c1f1c1f1c02';
let reports;
let booking;
let claim;
let notes;
let server;
let base;
let store;
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const makeReport = (over = {}) => {
  const r = {
    _id: R1, bookingId: 'CZ-1', technicianId: 'T1', workSummary: 'Cleaned', issueResolution: 'Complete', laborHours: 2, followUpRequired: false,
    isFinal: true, signedFormPhoto: undefined, ...over,
  };
  r.toObject = () => ({ ...r });
  r.save = async () => r;
  r.deleteOne = async () => { reports = reports.filter((x) => x !== r); };
  return r;
};

test.before(async () => {
  User.findById = (id) => chain({ _id: id, role: id === 'ADM1' ? 'admin' : 'staff', isActive: true, name: id });
  User.findOne = (f) => chain({ _id: f && f._id, name: 'Lead' });
  Report.findById = (id) => chain(reports.find((r) => String(r._id) === String(id)) || null);
  Report.findOne = (f) => chain(reports.find((r) => (f.bookingId ? r.bookingId === f.bookingId : (r.backJob && String(r.backJob.originalReportId) === String(f['backJob.originalReportId'])))) || null);
  BackJob.findOne = () => chain(claim);
  Booking.findOne = () => chain(booking);
  Booking.updateOne = async (f, update) => { if (update.$set) Object.assign(booking, update.$set); if (update.$unset) Object.keys(update.$unset).forEach((k) => delete booking[k]); };
  Notification.create = async (d) => { notes.push(d); return d; };
  AuditLog.create = async () => ({});
  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(() => {
  store = createMemoryStore();
  setStore(store);
  authCache.clear();
  notes = [];
  claim = null;
  reports = [makeReport()];
  booking = { bookingId: 'CZ-1', status: 'Completed', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], paymentStatus: 'partially_paid', balancePaymentStatus: 'None', reportSubmitted: true, completedAt: new Date() };
});

const send = async (method, body, as = 'ADM1') => {
  const token = jwt.sign({ id: as, role: as === 'ADM1' ? 'admin' : 'staff' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/reports/${R1}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ---- edit
test('an admin edit with a bad resolution, labor hours or follow-up is a 400 and nothing changes', async () => {
  for (const body of [
    { issueResolution: 'Bogus' }, { laborHours: 25 }, { laborHours: 1.3 }, { laborHours: 'abc' }, { workSummary: '   ' },
    { followUpRequired: true }, { followUpRequired: true, followUpDate: '2020-01-01' }, { followUpRequired: 'maybe' }, { notes: 'x'.repeat(2001) },
  ]) {
    const res = await send('PATCH', body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 50));
  }
  assert.equal(reports[0].issueResolution, 'Complete');
  assert.equal(reports[0].laborHours, 2);
});

test('a good edit is saved, and fields that are not on the allowed list are ignored', async () => {
  const res = await send('PATCH', { workSummary: 'Cleaned and tested', laborHours: '3.5', issueResolution: 'Partial', technicianId: 'T9', isFinal: false });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(reports[0].workSummary, 'Cleaned and tested');
  assert.equal(reports[0].laborHours, 3.5);
  assert.equal(reports[0].technicianId, 'T1');
  assert.equal(reports[0].isFinal, true);
});

test('an old report with no labor hours can still have its summary corrected', async () => {
  reports[0].laborHours = undefined;
  reports[0].followUpRequired = undefined;
  const res = await send('PATCH', { workSummary: 'Corrected wording' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('turning a follow-up off clears its date; a follow-up that is not being changed is not held to today', async () => {
  reports[0].followUpRequired = true;
  reports[0].followUpDate = new Date('2020-01-01T00:00:00Z');
  assert.equal((await send('PATCH', { workSummary: 'Changed text only' })).status, 200);
  assert.equal((await send('PATCH', { followUpRequired: false })).status, 200);
  assert.equal(reports[0].followUpDate, undefined);
});

test('a technician who is not the author cannot edit', async () => {
  assert.equal((await send('PATCH', { workSummary: 'x' }, 'T2')).status, 403);
});

// ---- delete
test('delete needs a reason', async () => {
  for (const body of [undefined, {}, { reason: '' }, { reason: 'ab' }, { reason: 'x'.repeat(301) }, { reason: 12345 }]) {
    assert.equal((await send('DELETE', body)).status, 400, JSON.stringify(body));
  }
  assert.equal(reports.length, 1);
});

test('a good delete removes the report and its photo file, reopens the job, and tells the lead', async () => {
  const photo = '0123456789abcdef0123456789abcdef.png';
  await store.save({ name: photo, buffer: PNG_BYTES, contentType: 'image/png', metadata: { kind: 'signed_form' } });
  reports[0].signedFormPhoto = `/uploads/proofs/${photo}`;
  const res = await send('DELETE', { reason: 'Filed on the wrong job' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(reports.length, 0);
  assert.equal(await store.exists(photo), false, 'the photo is gone from the file store');
  assert.equal(booking.status, 'In Progress');
  assert.equal(booking.reportSubmitted, false);
  assert.equal(booking.completedAt, undefined);
  assert.deepEqual(notes.map((n) => n.user), ['T1']);
  assert.equal(notes[0].type, 'report_removed');
});

test('a report with no photo deletes fine, and a missing photo file is not an error', async () => {
  assert.equal((await send('DELETE', { reason: 'Duplicate' })).status, 200);
  reports = [makeReport({ signedFormPhoto: '/uploads/proofs/not-there-at-all.png' })];
  assert.equal((await send('DELETE', { reason: 'Duplicate' })).status, 200);
});

test('a photo path that is not a plain stored proof path never removes anything', async () => {
  await store.save({ name: 'keepme.png', buffer: PNG_BYTES, contentType: 'image/png', metadata: { kind: 'proof' } });
  for (const stored of ['/uploads/proofs/../keepme.png', '/elsewhere/keepme.png', 'keepme.png', '/uploads/profile-images/keepme.png']) {
    reports = [makeReport({ signedFormPhoto: stored })];
    assert.equal((await send('DELETE', { reason: 'Duplicate' })).status, 200, stored);
    assert.equal(await store.exists('keepme.png'), true, stored);
  }
});

test('delete is refused (409) while a back job claim depends on the report, or a later report links to it', async () => {
  claim = { backJobId: 'BJ-1', originalBookingId: 'CZ-1' };
  const refused = await send('DELETE', { reason: 'Duplicate' });
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /back job claim/);
  assert.equal(reports.length, 1);
  assert.equal(booking.status, 'Completed');

  claim = null;
  reports.push(makeReport({ _id: R2, bookingId: 'CZ-2', backJob: { originalReportId: R1 } }));
  assert.equal((await send('DELETE', { reason: 'Duplicate' })).status, 409);
});

test('delete is refused (409) when the booking is already fully paid, and says why', async () => {
  booking.paymentStatus = 'fully_paid';
  const res = await send('DELETE', { reason: 'Duplicate' });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already fully paid/);
  assert.equal(reports.length, 1);
  booking.paymentStatus = 'partially_paid';
  booking.balancePaymentStatus = 'paid';
  assert.equal((await send('DELETE', { reason: 'Duplicate' })).status, 409);
});

test('only an admin can delete', async () => {
  assert.equal((await send('DELETE', { reason: 'Duplicate' }, 'T1')).status, 403);
  assert.equal(reports.length, 1);
});
