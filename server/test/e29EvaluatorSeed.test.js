// Run with: npm test (inside server/). E29: the Evaluator seed script (scripts/seedEvaluatorData.js). The real script, the real pricing, the real 3 month
// reminder job and the real day start job run against an in-memory stand-in for the database, with a fixed clock (no weekday, no real clock). Nothing
// connects to a database, and the mail queue is a stub (no message is ever handed to a mail server).
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { matches, chain } = require('./helpers/memoryQueries');

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const Service = require('../models/Service');
const Closure = require('../models/Closure');
const Notification = require('../models/Notification');
const ServiceReminder = require('../models/ServiceReminder');
const AuditLog = require('../models/AuditLog');
const Counter = require('../models/Counter');
const EmailDelivery = require('../models/EmailDelivery');
const { createMemoryStore } = require('../storage/fileStore');
const { getPaymentBreakdown } = require('../utils/pricing');
const { runDayStart } = require('../utils/bookingLifecycle');
const emailDelivery = require('../utils/emailDelivery');
const seed = require('../scripts/seedEvaluatorData');

// 2026-11-10 12:00 in Manila (UTC+8): the day the script is run
const NOW = new Date('2026-11-10T04:00:00Z');
const TECH_PASSWORD = `${require('node:crypto').randomBytes(12).toString('base64url')}-42`; // made fresh for each run
const CUSTOMER_PASSWORD = `${require('node:crypto').randomBytes(12).toString('base64url')}-77`;
const ENV = { EVALUATOR_TECHNICIAN_PASSWORD: TECH_PASSWORD, EVALUATOR_CUSTOMER_PASSWORD: CUSTOMER_PASSWORD };

let db;
let store;
let seq;

const cleaning = { _id: 'S-CLEAN', name: 'Regular Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const installation = { _id: 'S-INSTALL', name: 'Installation', serviceType: 'Installation', price: 2500, isActive: true };
const checkup = { _id: 'S-CHECK', name: 'Check-up', serviceType: 'Check-up', price: 500, isActive: true };

function install() {
  const table = (key) => db[key];
  const make = (key, extra = {}) => (data) => {
    seq += 1;
    const doc = { _id: `${key}-${seq}`, ...JSON.parse(JSON.stringify(data)), ...extra };
    // dates are kept as Dates when the code gave Dates (the serialisation above turns them into text)
    Object.entries(data).forEach(([k, v]) => { if (v instanceof Date) doc[k] = v; });
    if (data._id !== undefined) doc._id = data._id;
    doc.save = async () => doc;
    doc.populate = async () => doc;
    return doc;
  };
  const model = (Model, key, { create = true } = {}) => {
    Model.find = (f) => chain(table(key).filter((d) => matches(d, f)));
    Model.findOne = (f) => chain(table(key).find((d) => matches(d, f)) || null);
    Model.findById = (id) => chain(table(key).find((d) => d._id === id) || null);
    if (create) {
      Model.create = async (data) => { const doc = make(key)(data); table(key).push(doc); return doc; };
    }
    Model.updateOne = async (f, update) => {
      const hit = table(key).find((d) => matches(d, f));
      if (hit && update.$set) Object.assign(hit, update.$set);
      return { acknowledged: true };
    };
    Model.deleteMany = async (f) => {
      const keep = table(key).filter((d) => !matches(d, f));
      const removed = table(key).length - keep.length;
      db[key] = keep;
      return { deletedCount: removed };
    };
  };
  model(User, 'users');
  model(Booking, 'bookings');
  model(Report, 'reports');
  model(Notification, 'notes');
  model(ServiceReminder, 'reminders');
  model(AuditLog, 'audits');
  model(Service, 'services', { create: false });
  model(Closure, 'closures', { create: false });
  Counter.findOneAndUpdate = async () => ({ seq: (seq += 1000) });
  Booking.findOneAndUpdate = (f, update) => {
    const found = db.bookings.find((b) => matches(b, f));
    if (found && update.$set) Object.assign(found, update.$set);
    return chain(found || null);
  };
  EmailDelivery.create = async (doc) => { db.mail.push(doc); return doc; };
}

test.beforeEach(() => {
  seq = 0;
  db = { users: [], bookings: [], reports: [], notes: [], reminders: [], audits: [], services: [cleaning, installation, checkup], closures: [], mail: [] };
  store = createMemoryStore();
  install();
});

const lines = [];
const log = (line) => lines.push(String(line));
const go = (over = {}) => seed.run({ now: NOW, audit: true, dbName: 'CZAMS_audit_test', env: ENV, log, store, ...over });
const reset = () => { lines.length = 0; };

// the records that are not Evaluator ones: an admin, a real customer with a similar address, and a real booking with its notification
function addRealData() {
  db.users.push({ _id: 'ADM1', name: 'Owner', email: 'owner@cooling.example.test', role: 'admin', password: 'hash-admin', isActive: true });
  db.users.push({ _id: 'CUS1', name: 'Real Customer', email: 'customerone@email.com', role: 'customer', password: 'hash-real', isActive: true });
  db.bookings.push({ _id: 'b-real', bookingId: 'CZ-REAL-1', customer: 'CUS1', status: 'Completed', service: 'S-CLEAN', date: '2026-10-20', completedAt: new Date('2026-10-20T04:00:00Z') });
  db.notes.push({ _id: 'n-real', user: 'CUS1', type: 'booking_completed', message: 'Done', relatedBookingId: 'CZ-REAL-1' });
  db.audits.push({ _id: 'a-real', actor: { id: 'ADM1' }, action: 'booking.approve', entityType: 'Booking', entityId: 'CZ-REAL-1' });
}
const snapshot = () => JSON.stringify({ users: db.users, bookings: db.bookings, reports: db.reports, notes: db.notes, reminders: db.reminders, audits: db.audits });

test('a dry run writes nothing, says whether the customer would be flagged, and shows no password', async () => {
  addRealData();
  const before = snapshot();
  const result = await go();
  assert.equal(snapshot(), before, 'nothing was written');
  assert.equal(store.list ? (await store.list()).length : 0, 0, 'no file was stored');
  assert.equal(result.reminderFlagged, true);
  assert.deepEqual(result.wouldCreate, { users: 2, bookings: 6, reports: 1 });
  assert.match(lines.join('\n'), /would be flagged for the 3 month reminder/);
  assert.match(lines.join('\n'), /Mode: dry run/);
});

test('apply creates the two accounts, the six sample bookings and the report, with consistent amounts', async () => {
  addRealData();
  const result = await go({ apply: true });
  assert.equal(result.usersCreated, 2);
  assert.equal(result.bookingsCreated, 6);
  assert.equal(result.reportsCreated, 1);
  const mine = db.users.filter((u) => u.isEvaluatorSample);
  assert.deepEqual(mine.map((u) => [u.email, u.role]).sort(), [['customerone@example.com', 'customer'], ['technicianone@example.com', 'staff']]);
  assert.ok(!db.users.some((u) => u.role === 'admin' && u.isEvaluatorSample), 'no admin account was made');
  assert.equal(db.users.find((u) => u._id === 'ADM1').password, 'hash-admin', 'the existing admin is untouched');
  assert.equal(db.users.find((u) => u._id === 'CUS1').password, 'hash-real', 'the real customer account is untouched');

  const evaluatorBookings = db.bookings.filter((b) => b.isEvaluatorSample);
  const byStatus = (s) => evaluatorBookings.filter((b) => b.status === s);
  assert.equal(byStatus('Completed').length, 1);
  assert.equal(byStatus('Pending').length, 2);
  assert.equal(byStatus('Approved').length, 3);
  assert.ok(byStatus('Approved').some((b) => b.service === 'S-INSTALL'), 'one Approved booking is an Installation');
  const technicianId = mine.find((u) => u.role === 'staff')._id;
  byStatus('Approved').forEach((b) => assert.equal(b.assignments[0].lead, technicianId, 'the Evaluator technician is listed first'));

  const done = byStatus('Completed')[0];
  assert.equal(done.paymentStatus, 'fully_paid');
  assert.equal(done.balancePaid, true);
  assert.equal(done.paymentEvents.length, 2);
  assert.ok(done.reportSubmitted && done.reportId, 'a report is filed');
  assert.equal(db.reports.length, 1);
  assert.equal(db.reports[0].technicianId, technicianId);
  const breakdown = getPaymentBreakdown({ ...done, service: cleaning });
  assert.equal(done.paymentEvents[0].amount, breakdown.downPayment, 'the amounts come from the shared pricing');
  assert.equal(done.paymentEvents[1].amount, breakdown.balance);

  const proof = byStatus('Pending').find((b) => b.evaluatorKey === 'pending-proof');
  assert.equal(proof.paymentStatus, 'to_verify');
  assert.ok(proof.proofFile, 'a proof image is waiting to be checked');
  assert.equal(byStatus('Pending').find((b) => b.evaluatorKey === 'pending-unpaid').paymentStatus, 'Unpaid');
  evaluatorBookings.forEach((b) => assert.equal(b.evaluatorBatch, 'e29'));
  assert.ok(db.audits.length >= 8, 'audit lines were written');
});

test('the dates: the old cleaning is over 3 months ago, the Pending ones are 3 or more days ahead, the Approved ones 3 to 5 weeks, none on a Sunday', async () => {
  await go({ apply: true });
  const today = '2026-11-10';
  const days = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
  for (const b of db.bookings) assert.notEqual(new Date(`${b.date}T00:00:00Z`).getUTCDay(), 0, `${b.evaluatorKey} is not on a Sunday`);
  const get = (key) => db.bookings.find((b) => b.evaluatorKey === key);
  assert.ok(days(get('completed-cleaning').date, today) >= 98 && days(get('completed-cleaning').date, today) <= 101);
  assert.ok(days(today, get('pending-proof').date) >= 3);
  assert.ok(days(today, get('pending-unpaid').date) >= 3);
  for (const key of ['approved-1', 'approved-2', 'approved-installation']) {
    const ahead = days(today, get(key).date);
    assert.ok(ahead >= 21 && ahead <= 35, `${key} is ${ahead} days ahead`);
  }
});

test('running it twice changes nothing the second time', async () => {
  await go({ apply: true });
  const first = snapshot();
  const files = (await store.list()).length;
  reset();
  const again = await go({ apply: true });
  assert.equal(again.usersCreated + again.bookingsCreated + again.reportsCreated, 0);
  assert.equal(snapshot(), first, 'no duplicates and no change');
  assert.equal((await store.list()).length, files);
  assert.match(lines.join('\n'), /Accounts: 2 exist, 0 to create/);
});

test('the real 3 month job flags the Evaluator customer, and the reminder is delivered once', async () => {
  await go({ apply: true });
  assert.equal(db.reminders.length, 1);
  assert.equal(db.reminders[0].status, 'Notified');
  const customer = db.users.find((u) => u.email === 'customerone@example.com');
  assert.equal(db.reminders[0].customer, customer._id);
  assert.equal(db.notes.filter((n) => n.type === 'service_reminder' && n.user === customer._id).length, 1);
  await go({ apply: true });
  assert.equal(db.reminders.length, 1, 'still one reminder per customer and last cleaning');
  assert.equal(db.notes.filter((n) => n.type === 'service_reminder').length, 1);
});

test('the Approved bookings stay Approved after the expiry and auto-start jobs run inside the evaluation window', async () => {
  await go({ apply: true });
  const statusOf = () => db.bookings.filter((b) => b.isEvaluatorSample).map((b) => `${b.evaluatorKey}:${b.status}`).sort();
  const before = statusOf();
  const inFourDays = new Date(NOW.getTime() + 4 * 86400000);
  const result = await runDayStart({ now: inFourDays });
  assert.equal(result.expiry.expired, 0);
  assert.equal(result.start.started, 0);
  assert.deepEqual(statusOf(), before);
  const inTenDays = new Date(NOW.getTime() + 10 * 86400000);
  await runDayStart({ now: inTenDays });
  assert.ok(db.bookings.filter((b) => b.evaluatorKey && b.evaluatorKey.startsWith('approved')).every((b) => b.status === 'Approved'), 'the three Approved bookings are still Approved ten days in');
});

test('with --audit only the audit database is allowed, before anything is read or written', async () => {
  assert.deepEqual(seed.ALLOWLIST, ['CZAMS_audit_test']);
  await assert.rejects(go({ dbName: 'SomeOtherDb', apply: true }), /only CZAMS_audit_test is allowed/);
  await assert.rejects(go({ dbName: 'SomeOtherDb', apply: true, live: true, env: { ...ENV, EVALUATOR_LIVE_DB_NAME: 'SomeOtherDb' } }), /only CZAMS_audit_test is allowed/, 'the live flag and variable do not widen --audit');
  await assert.rejects(go({ dbName: '' }), /does not name a database/);
  await assert.rejects(go({ dbName: 'SomeOtherDb', cleanup: true }), /only CZAMS_audit_test is allowed/);
  assert.equal(db.users.length, 0);
  assert.equal(seed.checkDatabase('CZAMS_audit_test', { audit: true }).ok, true);
  assert.equal(seed.checkDatabase('CZAMS_audit_test', { audit: true }).live, false);
});

// a made up name stands in for the live one: the real name is never written in the code or the tests
const LIVE = 'SampleLiveDatabase';
const liveEnv = (over = {}) => ({ ...ENV, EVALUATOR_LIVE_DB_NAME: LIVE, ...over });
const live = (over = {}) => go({ audit: false, live: true, dbName: LIVE, env: liveEnv(), ...over });

test('without --audit the script runs only when the flag, the variable and an exact name all agree', async () => {
  // all three: it runs (a dry run here)
  const ok = await live();
  assert.equal(ok.applied, false);
  assert.match(lines.join('\n'), /Database: SampleLiveDatabase \(the live database/);
  reset();
  // no flag
  await assert.rejects(live({ live: false }), /needs --i-know-this-is-live/);
  // no variable, or an empty or blank one
  await assert.rejects(live({ env: ENV }), /set EVALUATOR_LIVE_DB_NAME/);
  await assert.rejects(live({ env: liveEnv({ EVALUATOR_LIVE_DB_NAME: '' }) }), /set EVALUATOR_LIVE_DB_NAME/);
  await assert.rejects(live({ env: liveEnv({ EVALUATOR_LIVE_DB_NAME: '   ' }) }), /set EVALUATOR_LIVE_DB_NAME/);
  // a name that is not exactly the variable: other case, a prefix, a suffix, the audit database
  for (const name of ['samplelivedatabase', 'SampleLive', 'SampleLiveDatabase2', 'CZAMS_audit_test', 'SampleLiveDatabase ']) {
    await assert.rejects(live({ dbName: name }), /not the name in EVALUATOR_LIVE_DB_NAME/, name);
  }
  // an allowlisted name is not a way in without --audit either
  await assert.rejects(go({ audit: false, dbName: 'CZAMS_audit_test' }), /needs --i-know-this-is-live/);
  await assert.rejects(go({ audit: false, live: true, dbName: 'CZAMS_audit_test' }), /set EVALUATOR_LIVE_DB_NAME/);
  assert.equal(db.users.length, 0, 'nothing was written by any refused run');
  assert.equal(db.bookings.length, 0);
});

test('the same guard covers apply, cleanup and show-existing without --audit', async () => {
  for (const mode of [{ apply: true }, { cleanup: true }, { cleanup: true, apply: true }, { showExisting: true }]) {
    await assert.rejects(live({ ...mode, live: false }), /needs --i-know-this-is-live/);
    await assert.rejects(live({ ...mode, env: ENV }), /set EVALUATOR_LIVE_DB_NAME/);
    await assert.rejects(live({ ...mode, dbName: 'Other' }), /not the name in EVALUATOR_LIVE_DB_NAME/);
  }
  assert.equal(db.users.length, 0);
});

test('the live name is never written in the code, and the passwords are still needed to write on the live database', async () => {
  const source = require('node:fs').readFileSync(require.resolve('../scripts/seedEvaluatorData.js'), 'utf8');
  assert.match(source, /EVALUATOR_LIVE_DB_NAME/);
  const names = [...source.matchAll(/CZAMS[A-Za-z_]*/g)].map((m) => m[0]).filter((n) => n !== 'CZAMS_audit_test' && n !== 'CZAMS');
  assert.deepEqual(names, [], 'no other database name appears');
  await assert.rejects(live({ apply: true, env: { EVALUATOR_LIVE_DB_NAME: LIVE } }), /EVALUATOR_TECHNICIAN_PASSWORD/);
  const done = await live({ apply: true });
  assert.equal(done.usersCreated, 2);
  assert.match(lines.join('\n'), /Live database: the 3 month reminder job was not run from here/);
  assert.equal(db.reminders.length, 0, 'the global reminder job is left to the server on a live database');
});

test('show-existing is read only and prints counts and dates only', async () => {
  const before = snapshot();
  await go({ showExisting: true, env: {} });
  assert.match(lines.join('\n'), /technicianone@example\.com: no account yet/);
  assert.match(lines.join('\n'), /customerone@example\.com: no account yet/);
  assert.equal(snapshot(), before);
  db.users.push({ _id: 'CUS55', name: 'Secret Name', email: 'customerone@example.com', role: 'customer', password: 'x', isActive: true });
  db.users.push({ _id: 'STF55', name: 'Other Secret', email: 'technicianone@example.com', role: 'staff', password: 'x', isActive: true });
  const add = (id, status, service, date, extra = {}) => db.bookings.push({ _id: id, bookingId: id, customer: 'CUS55', status, service, date, basePrice: 98765, ...extra });
  add('B1', 'Completed', 'S-CLEAN', '2026-05-02', { completedAt: new Date('2026-05-02T02:00:00Z'), assignments: [{ lead: 'STF55' }] });
  add('B2', 'Completed', 'S-CLEAN', '2026-08-09', { completedAt: new Date('2026-08-09T02:00:00Z'), assignments: [{ lead: 'STF55' }] });
  add('B3', 'Completed', 'S-INSTALL', '2026-09-20', { completedAt: new Date('2026-09-20T02:00:00Z') });
  add('B4', 'Pending', 'S-CLEAN', '2026-11-20');
  add('B5', 'Approved', 'S-CHECK', '2026-11-25', { assignments: [{ lead: 'STF55' }] });
  const unrelated = JSON.stringify(db.bookings);
  reset();
  const result = await go({ showExisting: true, env: {} });
  const text = lines.join('\n');
  assert.match(text, /customerone@example\.com: account exists, 5 bookings/);
  assert.match(text, /by status: Approved 1, Completed 3, Pending 1/);
  assert.match(text, /by service type: Check-up 1, Cleaning 3, Installation 1/);
  assert.match(text, /latest Completed cleaning: 2026-08-09/);
  assert.match(text, /technicianone@example\.com: account exists, 3 bookings assigned/);
  assert.equal(result.customer.latestCompletedCleaning, '2026-08-09');
  assert.equal(result.technician.latestCompletedCleaning, '2026-08-09');
  for (const secret of ['Secret Name', 'Other Secret', '98765', 'B1', 'CUS55', 'STF55']) assert.ok(!text.includes(secret), `the output holds no ${secret}`);
  assert.equal(JSON.stringify(db.bookings), unrelated, 'nothing was written');
  assert.equal(db.reminders.length, 0);
  assert.equal(db.notes.length, 0);
});

test('it refuses to run when either password is missing, and a password never appears in any output or stored as text', async () => {
  await assert.rejects(go({ env: { EVALUATOR_TECHNICIAN_PASSWORD: TECH_PASSWORD } }), /EVALUATOR_CUSTOMER_PASSWORD/);
  await assert.rejects(go({ env: { EVALUATOR_CUSTOMER_PASSWORD: CUSTOMER_PASSWORD } }), /EVALUATOR_TECHNICIAN_PASSWORD/);
  await assert.rejects(go({ env: {}, apply: true }), /Refusing to run/);
  assert.equal(db.users.length, 0);
  await go({ apply: true, resetPasswords: true });
  const everything = lines.join('\n') + JSON.stringify(db);
  assert.ok(!everything.includes(TECH_PASSWORD), 'the technician password is not in any line or record');
  assert.ok(!everything.includes(CUSTOMER_PASSWORD), 'the customer password is not in any line or record');
  const tech = db.users.find((u) => u.email === 'technicianone@example.com');
  const customer = db.users.find((u) => u.email === 'customerone@example.com');
  assert.ok(await bcrypt.compare(TECH_PASSWORD, tech.password), 'the stored value is a hash of the environment password');
  assert.ok(await bcrypt.compare(CUSTOMER_PASSWORD, customer.password));
  const source = require('node:fs').readFileSync(require.resolve('../scripts/seedEvaluatorData.js'), 'utf8');
  assert.ok(!source.includes(TECH_PASSWORD) && !source.includes(CUSTOMER_PASSWORD), 'no password is written in the script');
});

test('an account that already exists keeps its password unless --reset-passwords is given, and is never changed otherwise', async () => {
  const existingHash = await bcrypt.hash('Old-password-1!', 4);
  db.users.push({ _id: 'CUS777', name: 'Existing Evaluator', email: 'customerone@example.com', role: 'customer', password: existingHash, isActive: true });
  await go({ apply: true });
  const customer = db.users.find((u) => u.email === 'customerone@example.com');
  assert.equal(customer.password, existingHash, 'the password was left alone');
  assert.equal(customer.isEvaluatorSample, undefined, 'an account the script did not make is not marked or changed');
  assert.ok(db.bookings.filter((b) => b.isEvaluatorSample).every((b) => b.customer === 'CUS777'), 'the sample bookings belong to that account');
  await go({ apply: true, resetPasswords: true });
  assert.ok(await bcrypt.compare(CUSTOMER_PASSWORD, db.users.find((u) => u.email === 'customerone@example.com').password), 'reset-passwords sets it from the environment');
  assert.equal(db.users.filter((u) => u.email === 'customerone@example.com').length, 1);
});

test('cleanup removes only what the script made, and leaves the real records, accounts it did not make, and an exact copy of the earlier state', async () => {
  addRealData();
  const existingHash = 'hash-existing';
  db.users.push({ _id: 'CUS777', name: 'Existing Evaluator', email: 'customerone@example.com', role: 'customer', password: existingHash, isActive: true });
  const before = snapshot();
  await go({ apply: true });
  assert.notEqual(snapshot(), before);
  reset();
  const dry = await go({ cleanup: true, env: {} });
  assert.equal(dry.applied, false);
  assert.ok(dry.bookings === 6 && dry.users === 1 && dry.reports === 1, 'counts only: 6 bookings, 1 account (the technician), 1 report');
  assert.equal(db.bookings.filter((b) => b.isEvaluatorSample).length, 6, 'a dry run removed nothing');
  const done = await go({ cleanup: true, apply: true, env: {} });
  assert.equal(done.applied, true);
  assert.equal(snapshot(), before, 'everything is back as it was, and the real records were never touched');
  assert.equal((await store.list()).length, 0, 'the proof files are gone too');
});

test('cleanup refuses to delete anything without the marker', async () => {
  addRealData();
  db.bookings.push({ _id: 'b-lookalike', bookingId: 'CZ-LOOK-1', customer: 'CUS1', evaluatorKey: 'approved-1', status: 'Approved' });
  const before = snapshot();
  await go({ cleanup: true, apply: true });
  assert.equal(snapshot(), before, 'a booking that only looks like a sample (no marker) is not removed');
});

test('no email is ever attempted to an example.com or .invalid address, queued or already queued', async () => {
  const env = { SMTP_HOST: 'smtp.test.invalid', SMTP_FROM: 'noreply@cooling.example.test', APP_URL: 'https://app.example.test' };
  await go({ apply: true });
  const customer = db.users.find((u) => u.email === 'customerone@example.com');
  const queued = await emailDelivery.queueNotificationEmail(customer._id, 'service_reminder', 'Reminder', 'n1', env);
  assert.equal(queued, null, 'nothing queued for customerone@example.com');
  assert.equal(db.mail.length, 0, 'the 3 month reminder made no email row');
  assert.equal(emailDelivery.isUndeliverableAddress('a@evaluator.invalid'), true);
  assert.equal(emailDelivery.isUndeliverableAddress('someone@mail.example.org'), true);
  assert.equal(emailDelivery.isUndeliverableAddress('customerone@email.com'), false, 'a real address is still mailed');
  assert.equal(emailDelivery.isUndeliverableAddress('c@example.test'), false);
  // a row that was queued earlier is marked failed at once, and the send function is never called
  const row = { _id: 'e1', status: 'pending', nextAttemptAt: new Date(0), attempts: 0, recipientEmail: 'customerone@example.com' };
  const updates = [];
  let sends = 0;
  EmailDelivery.findOneAndUpdate = async () => (updates.length === 0 ? row : null);
  EmailDelivery.updateOne = async (f, update) => { updates.push(update); return {}; };
  const processed = await emailDelivery.processPendingEmailDeliveries({ now: NOW, send: async () => { sends += 1; } });
  assert.equal(processed.processed, 1);
  assert.equal(sends, 0, 'no attempt was made');
  assert.equal(updates[0].$set.status, 'failed');
  await assert.rejects(emailDelivery.sendEmailNow({ to: 'customerone@example.com', subject: 's', text: 't', html: 'h' }, { SMTP_HOST: 'h', SMTP_FROM: 'f@x.test' }), /never mailed/);
});
