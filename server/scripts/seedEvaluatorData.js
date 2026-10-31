/* eslint-disable no-console -- a command-line script: printing is its output */
// Prepares the shared Evaluator accounts and their sample data for the capstone evaluation: one technician account, one customer account, and
// sample bookings for the customer. It never creates, edits, resets or deletes an admin account: the evaluators use the existing admin as it is.
//
//   node scripts/seedEvaluatorData.js --audit                               dry run (default): prints counts, writes nothing
//   node scripts/seedEvaluatorData.js --audit --apply                       creates what is missing (running it again changes nothing)
//   node scripts/seedEvaluatorData.js --audit --apply --reset-passwords     also sets the two accounts' passwords again, from the environment
//   node scripts/seedEvaluatorData.js --audit --cleanup                     dry run of the removal: counts only
//   node scripts/seedEvaluatorData.js --audit --cleanup --apply             removes only what this script made (the marker) and nothing else
//
// The two passwords come from the environment, set by the owner in their own terminal and never written anywhere by this script:
//   EVALUATOR_TECHNICIAN_PASSWORD   EVALUATOR_CUSTOMER_PASSWORD
// The script refuses to run (seeding or a dry run of it) when either is missing, and never prints them. An account that already exists keeps its
// password unless --reset-passwords is given.
//
// With --audit the script connects to CZAMS_audit_test only (scripts/lib/auditDb.js) and the allowlist below applies.
// Without --audit it connects with MONGO_URI (the environment, else server/.env) and runs ONLY when all three are true, checked before any
// connection is made and again on the connected database: --i-know-this-is-live is passed, the environment variable EVALUATOR_LIVE_DB_NAME is
// set, and the database name equals that variable exactly. The live name is never written in the code. Otherwise it refuses. It prints the
// database NAME only, never the connection string.
//
//   node scripts/seedEvaluatorData.js --show-existing [--audit | --i-know-this-is-live]   read only: for the two accounts, counts by status and
//   service type, and the date of the latest Completed cleaning (counts and dates only: no names, no amounts). It writes nothing and needs no
//   passwords. Run it before --apply to see what history the accounts already have.
//
// Everything it creates carries the marker isEvaluatorSample: true and evaluatorBatch: 'e29' (or is tied to a marked booking). It finds its own
// records by that marker and never touches anything else, so a second run creates nothing and --cleanup removes only these. The bookings follow
// the shared pricing (the amounts come from utils/pricing.js and the service's own prices); the payment history, audit lines and the service
// report are written the way the routes write them. It never creates a service: it uses the services that exist.
const crypto = require('crypto');
const path = require('path');

const BATCH = 'e29';
const ALLOWLIST = Object.freeze(['CZAMS_audit_test']);
const TECHNICIAN_PASSWORD_VAR = 'EVALUATOR_TECHNICIAN_PASSWORD';
const CUSTOMER_PASSWORD_VAR = 'EVALUATOR_CUSTOMER_PASSWORD';
const SEED_ACTOR = Object.freeze({ id: 'evaluator-seed', name: 'Evaluator sample data', role: 'system' });

const ACCOUNTS = Object.freeze([
  { key: 'technician', _id: 'STFEVAL', role: 'staff', name: 'Evaluator Technician', email: 'technicianone@example.com', phone: '09170000002', position: 'Technician', passwordVar: TECHNICIAN_PASSWORD_VAR },
  { key: 'customer', _id: 'CUSEVAL', role: 'customer', name: 'Evaluator Customer', email: 'customerone@example.com', phone: '09170000003', address: 'Quezon City', passwordVar: CUSTOMER_PASSWORD_VAR },
]);

// 1x1 PNG: the stand-in proof of payment image
const PROOF_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const marker = () => ({ isEvaluatorSample: true, evaluatorBatch: BATCH });

// ---- pure helpers ----------------------------------------------------------------------------------------------------------------------

const LIVE_DB_VAR = 'EVALUATOR_LIVE_DB_NAME';

// Decides whether this database may be used. Prints nothing; the caller prints the name.
//   audit  (--audit): the name must be on the allowlist (CZAMS_audit_test).
//   not audit:        all of these must hold: live (--i-know-this-is-live), liveName (the value of EVALUATOR_LIVE_DB_NAME) is set, and the name
//                     equals it exactly. Nothing else is accepted, not even an allowlisted name.
function checkDatabase(name, { audit = false, live = false, liveName = '' } = {}) {
  if (!name || typeof name !== 'string') return { ok: false, message: 'The connection string does not name a database, so nothing was done.' };
  if (audit) {
    if (ALLOWLIST.includes(name)) return { ok: true, live: false };
    return { ok: false, message: `Refusing to run on the database "${name}" with --audit: only ${ALLOWLIST.join(', ')} is allowed.` };
  }
  if (!live) return { ok: false, message: `Refusing to run on the database "${name}": without --audit the script needs --i-know-this-is-live, ${LIVE_DB_VAR} set to the database name, and a connection to exactly that database.` };
  if (typeof liveName !== 'string' || liveName.trim() === '') return { ok: false, message: `Refusing to run on the database "${name}": set ${LIVE_DB_VAR} to the exact name of the database you mean.` };
  if (name !== liveName) return { ok: false, message: `Refusing to run: the connected database is "${name}", which is not the name in ${LIVE_DB_VAR}. Nothing was done.` };
  return { ok: true, live: true };
}

// The two passwords, from the environment. Names only in a message, never a value.
function readPasswords(env = process.env) {
  const missing = ACCOUNTS.map((a) => a.passwordVar).filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
  if (missing.length > 0) return { ok: false, message: `Refusing to run: set ${missing.join(' and ')} in your terminal first. The script never stores or prints them.` };
  const short = ACCOUNTS.map((a) => a.passwordVar).filter((name) => env[name].length < 8);
  if (short.length > 0) return { ok: false, message: `Refusing to run: ${short.join(' and ')} must be at least 8 characters.` };
  return { ok: true, passwords: Object.fromEntries(ACCOUNTS.map((a) => [a.key, env[a.passwordVar]])) };
}

const isSunday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay() === 0;
// the first date at or after `key` that is not a Sunday and not a closed day
function openDay(key, closed, addDays) {
  let current = key;
  while (isSunday(current) || closed.has(current)) current = addDays(current, 1);
  return current;
}
// the first date at or before `key` that is not a Sunday
function openDayBefore(key, addDays) {
  let current = key;
  while (isSunday(current)) current = addDays(current, -1);
  return current;
}

const manilaMorning = (key) => new Date(`${key}T02:00:00Z`); // 10:00 in Manila

// ---- the run -------------------------------------------------------------------------------------------------------------------------------

// `options`: { apply, cleanup, resetPasswords, live, now, dbName, env, log, store, runReminders }. Returns a summary of counts.
async function run(options = {}) {
  const {
    apply = false, cleanup = false, showExisting = false, resetPasswords = false, audit = false, live = false, now = new Date(), dbName, env = process.env,
    log = console.log, store = null, runReminders = true,
  } = options;
  const verdict = checkDatabase(dbName, { audit, live, liveName: env[LIVE_DB_VAR] });
  if (!verdict.ok) throw new Error(verdict.message);
  let passwords = null;
  if (!cleanup && !showExisting) {
    const read = readPasswords(env);
    if (!read.ok) throw new Error(read.message);
    passwords = read.passwords;
  }
  log(`Database: ${dbName}${verdict.live ? ' (the live database: it matches EVALUATOR_LIVE_DB_NAME)' : ''}`);
  if (showExisting) { log('Mode: show existing (read only)'); return runShowExisting({ log }); }
  log(apply ? 'Mode: APPLY (writes)' : 'Mode: dry run (nothing is written)');
  return cleanup ? runCleanup({ apply, log, store }) : runSeed({ apply, resetPasswords, now, log, store, runReminders, live: verdict.live, passwords });
}

// Read only: what the two accounts already have, as counts and dates. No names, no amounts, no ids, nothing is written.
async function runShowExisting({ log }) {
  const User = require('../models/User');
  const Booking = require('../models/Booking');
  const Service = require('../models/Service');
  const { effectiveCompletedAt } = require('../utils/completion');
  const { manilaDateKey } = require('../utils/manilaDate');
  const services = await Service.find({});
  const typeOf = new Map(services.map((s) => [String(s._id), s.serviceType || 'Unknown']));
  const tally = (list, keyOf) => {
    const counts = new Map();
    list.forEach((item) => counts.set(keyOf(item), (counts.get(keyOf(item)) || 0) + 1));
    return [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  };
  const result = {};
  for (const account of ACCOUNTS) {
    const user = await User.findOne({ email: account.email });
    if (!user) {
      log(`${account.email}: no account yet`);
      result[account.key] = { exists: false };
      continue;
    }
    const filter = account.role === 'customer'
      ? { customer: user._id }
      : { $or: [{ technician: user._id }, { 'assignments.lead': user._id }, { 'assignments.helper': user._id }] };
    const bookings = await Booking.find(filter);
    const serviceTypeOf = (b) => typeOf.get(String(b.service)) || 'Unknown';
    const cleanings = bookings.filter((b) => b.status === 'Completed' && serviceTypeOf(b) === 'Cleaning');
    const latest = cleanings.map((b) => manilaDateKey(effectiveCompletedAt(b))).sort().pop() || null;
    log(`${account.email}: account exists, ${bookings.length} booking${account.role === 'customer' ? 's' : 's assigned'}`);
    log(`  by status: ${tally(bookings, (b) => b.status)}`);
    log(`  by service type: ${tally(bookings, serviceTypeOf)}`);
    log(`  latest Completed cleaning: ${latest || 'none'}`);
    result[account.key] = { exists: true, bookings: bookings.length, latestCompletedCleaning: latest };
  }
  return result;
}

async function loadMarked() {
  const User = require('../models/User');
  const Booking = require('../models/Booking');
  const Report = require('../models/Report');
  const filter = marker();
  const [users, bookings, reports] = await Promise.all([User.find(filter), Booking.find(filter), Report.find(filter)]);
  return { users, bookings, reports };
}

// What is tied to the marked records: notifications (to a marked account, or about a marked booking), reminders (about a marked booking) and
// audit lines (about a marked booking or account, or written by the seed). Nothing else.
function tiedFilters({ userIds, bookingIds, noteIds = [] }) {
  return {
    notifications: { $or: [{ user: { $in: userIds } }, { relatedBookingId: { $in: bookingIds } }, { _id: { $in: noteIds } }] },
    reminders: { lastCleaningBookingId: { $in: bookingIds } },
    audits: { $or: [{ 'actor.id': SEED_ACTOR.id }, { entityId: { $in: [...bookingIds, ...userIds] } }] },
  };
}

async function runCleanup({ apply, log, store }) {
  const Notification = require('../models/Notification');
  const ServiceReminder = require('../models/ServiceReminder');
  const AuditLog = require('../models/AuditLog');
  const User = require('../models/User');
  const Booking = require('../models/Booking');
  const Report = require('../models/Report');
  const { users, bookings, reports } = await loadMarked();
  const userIds = users.map((u) => u._id);
  const bookingIds = bookings.map((b) => b.bookingId);
  const files = [...new Set(bookings.flatMap((b) => [b.proofFile, b.balanceProofFile]).filter(Boolean))];
  // The 3 month reminder notification has no booking link, and its customer may be an account the script did not make. It is found through the
  // reminder about a marked booking: the same customer, the "book again" kind, naming that booking's cleaning date. Nothing else matches.
  const reminderRows = await ServiceReminder.find({ lastCleaningBookingId: { $in: bookingIds } });
  const reminderDates = reminderRows.map((r) => new Date(r.lastCleaningDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }));
  const reminderNotes = reminderRows.length === 0 ? [] : (await Notification.find({ type: 'service_reminder', user: { $in: reminderRows.map((r) => r.customer) } }))
    .filter((n) => !n.relatedBookingId && reminderDates.some((d) => String(n.message).includes(d)));
  const filters = tiedFilters({ userIds, bookingIds, noteIds: reminderNotes.map((n) => n._id) });
  const counts = { users: users.length, bookings: bookings.length, reports: reports.length, files: files.length, notifications: 0, reminders: 0, auditLines: 0 };
  const nothing = userIds.length === 0 && bookingIds.length === 0;
  if (!nothing) {
    counts.notifications = (await Notification.find(filters.notifications)).length;
    counts.reminders = (await ServiceReminder.find(filters.reminders)).length;
    counts.auditLines = (await AuditLog.find(filters.audits)).length;
  }
  log(`Cleanup would remove ${counts.users} accounts, ${counts.bookings} bookings, ${counts.reports} reports, ${counts.files} proof files, ${counts.notifications} notifications, ${counts.reminders} reminders and ${counts.auditLines} audit lines (all carrying the marker or tied to it).`);
  if (!apply) { log('Dry run: nothing was removed. Add --apply to remove them.'); return { ...counts, applied: false }; }
  if (nothing) return { ...counts, applied: true };
  await Notification.deleteMany(filters.notifications);
  await ServiceReminder.deleteMany(filters.reminders);
  await AuditLog.deleteMany(filters.audits);
  await Report.deleteMany({ ...marker(), bookingId: { $in: bookingIds } });
  await Booking.deleteMany({ ...marker(), bookingId: { $in: bookingIds } });
  await User.deleteMany({ ...marker(), _id: { $in: userIds } });
  if (store) {
    for (const file of files) await store.remove(String(file).split('/').pop()).catch(() => false);
  }
  log('Removed.');
  return { ...counts, applied: true };
}

async function runSeed({ apply, resetPasswords, now, log, store, runReminders, live, passwords }) {
  const User = require('../models/User');
  const Booking = require('../models/Booking');
  const Report = require('../models/Report');
  const Service = require('../models/Service');
  const Closure = require('../models/Closure');
  const { hashPassword } = require('../utils/password');
  const { manilaToday, addDaysManila, monthsAgoManilaKey } = require('../utils/manilaDate');
  const { buildPriceSnapshot } = require('../utils/priceSnapshot');
  const { getPaymentBreakdown } = require('../utils/pricing');
  const { recordAudit } = require('../utils/audit');
  const { createWithUniqueBookingId } = require('../utils/bookingId');
  const { nextQueueRank } = require('../utils/queue');
  const { storedPathFor } = require('../utils/fileAccess');
  const { runServiceReminderCheck, deliverPendingServiceReminders } = require('../jobs/serviceReminderJob');

  const summary = { usersCreated: 0, passwordsReset: 0, bookingsCreated: 0, reportsCreated: 0, wouldCreate: { users: 0, bookings: 0, reports: 0 }, applied: apply, reminderFlagged: null };

  // ---- accounts: found by their exact email. An account that exists is used as it is (its password changes only with --reset-passwords); a
  // different role under that address is never touched.
  const found = new Map();
  for (const account of ACCOUNTS) {
    const user = await User.findOne({ email: account.email });
    if (user && user.role !== account.role) throw new Error(`The address ${account.email} belongs to an account with another role. Nothing was changed.`);
    found.set(account.key, user);
  }
  const missingAccounts = ACCOUNTS.filter((a) => !found.get(a.key));
  summary.wouldCreate.users = missingAccounts.length;
  const techId = found.get('technician')?._id || ACCOUNTS[0]._id;
  const customerId = found.get('customer')?._id || ACCOUNTS[1]._id;

  // ---- the services the samples use (it never creates one)
  const cleaning = await Service.findOne({ serviceType: 'Cleaning', isActive: true });
  const installation = await Service.findOne({ serviceType: 'Installation', isActive: true });
  // a Check-up needs one technician (the pair rule: a Cleaning or an Installation needs two), so the Approved sample jobs use it when it exists
  const checkup = await Service.findOne({ serviceType: 'Check-up', isActive: true });
  if (!cleaning || !installation) throw new Error('There is no active Cleaning service and Installation service to base the sample bookings on. Nothing was changed.');

  // ---- the dates (Asia/Manila, never a Sunday, never a closed day)
  const today = manilaToday(now);
  const closed = new Set((await Closure.find({ date: { $gte: addDaysManila(today, 3), $lte: addDaysManila(today, 45) } })).map((c) => c.date));
  const dates = {
    completed: openDayBefore(addDaysManila(today, -100), addDaysManila),
    pendingProof: openDay(addDaysManila(today, 5), closed, addDaysManila),
    pendingNone: openDay(addDaysManila(today, 8), closed, addDaysManila),
    approved1: openDay(addDaysManila(today, 24), closed, addDaysManila),
    approved2: openDay(addDaysManila(today, 28), closed, addDaysManila),
    approved3: openDay(addDaysManila(today, 33), closed, addDaysManila),
  };
  const dueCutoff = monthsAgoManilaKey(3, now);

  const soloService = checkup || cleaning;
  const plan = [
    { key: 'completed-cleaning', service: cleaning, status: 'Completed', date: dates.completed, time: 'Morning', pay: 'full' },
    { key: 'pending-proof', service: cleaning, status: 'Pending', date: dates.pendingProof, time: 'Afternoon', pay: 'proof' },
    { key: 'pending-unpaid', service: cleaning, status: 'Pending', date: dates.pendingNone, time: 'Morning', pay: 'none' },
    { key: 'approved-1', service: soloService, status: 'Approved', date: dates.approved1, time: 'Morning', pay: 'down' },
    { key: 'approved-2', service: soloService, status: 'Approved', date: dates.approved2, time: 'Afternoon', pay: 'down' },
    { key: 'approved-installation', service: installation, status: 'Approved', date: dates.approved3, time: 'Morning', pay: 'down' },
  ];
  const have = new Set((await Booking.find(marker())).map((b) => b.evaluatorKey));
  const toCreate = plan.filter((p) => !have.has(p.key));
  summary.wouldCreate.bookings = toCreate.length;
  summary.wouldCreate.reports = have.has('completed-cleaning') ? 0 : 1;
  summary.reminderFlagged = dates.completed <= dueCutoff;

  log(`Accounts: ${ACCOUNTS.length - missingAccounts.length} exist, ${missingAccounts.length} to create.`);
  log(`Sample bookings: ${plan.length - toCreate.length} exist, ${toCreate.length} to create.`);
  log(`The Evaluator customer ${summary.reminderFlagged ? 'would be' : 'would NOT be'} flagged for the 3 month reminder (the old cleaning is dated on or before ${dueCutoff}).`);
  if (resetPasswords) log(`Passwords: the ${ACCOUNTS.length - missingAccounts.length} existing account(s) would get the password from the environment.`);
  if (!apply) { log('Dry run: nothing was written. Add --apply to create them.'); return summary; }

  // ---- accounts
  for (const account of ACCOUNTS) {
    const user = found.get(account.key);
    if (!user) {
      await User.create({
        _id: account._id, name: account.name, email: account.email, password: await hashPassword(passwords[account.key]), role: account.role,
        phone: account.phone, address: account.address, position: account.position, isActive: true, clientType: 'Residential', ...marker(),
      });
      summary.usersCreated += 1;
    } else if (resetPasswords) {
      await User.updateOne({ _id: user._id }, { $set: { password: await hashPassword(passwords[account.key]), passwordChangedAt: new Date(now) } });
      summary.passwordsReset += 1;
    }
  }

  // ---- the stand-in proof of payment image (one stored file per proof shown)
  const storeProof = async (bookingId) => {
    if (!store) return null;
    const name = `${crypto.randomBytes(16).toString('hex')}.png`;
    await store.save({ name, buffer: PROOF_PNG, contentType: 'image/png', metadata: { kind: 'proof', uploadedBy: customerId, bookingId } });
    return storedPathFor(name);
  };

  // ---- bookings
  const doneAt = manilaMorning(dates.completed);
  let reference = 0;
  const refNumber = () => { reference += 1; return String(900000000000 + reference + (Date.now() % 100000) * 1000).padStart(13, '0').slice(-13); };
  for (const p of toCreate) {
    const units = [{ type: 'Split Type', quantity: 1, brand: 'Sample', brandModel: 'Sample brand' }];
    const base = {
      customer: customerId, service: String(p.service._id), units, priceSnapshot: buildPriceSnapshot(p.service, units), date: p.date, time: p.time,
      address: 'Quezon City', contactNumber: '09170000003', downPaymentPercent: 50, paymentMode: 'GCash', paymentMode2: 'GCash',
      problemDescription: 'Evaluator sample booking.', isCommercial: false, balancePaymentStatus: 'None', refund: { status: 'None' }, ...marker(), evaluatorKey: p.key,
    };
    const breakdown = getPaymentBreakdown({ ...base, service: p.service });
    const event = (track, amount) => ({ track, status: 'verified', amount, method: 'GCash', by: { id: SEED_ACTOR.id, name: SEED_ACTOR.name }, at: p.pay === 'full' ? doneAt : new Date(now) });
    const stamp = p.pay === 'full' ? { createdAt: new Date(doneAt.getTime() - 10 * 86400000), updatedAt: doneAt } : {};
    let extra = {};
    if (p.pay === 'none') extra = { paymentStatus: 'Unpaid' };
    if (p.pay === 'proof') extra = { paymentStatus: 'to_verify', referenceNumber: refNumber(), downPaymentPaidAmount: breakdown.downPayment, proofFile: await storeProof(p.key) };
    if (p.pay === 'down' || p.pay === 'full') {
      extra = { paymentStatus: 'partially_paid', referenceNumber: refNumber(), proofFile: await storeProof(p.key), downPaymentPaidAmount: breakdown.downPayment, paymentEvents: [event('down', breakdown.downPayment)] };
    }
    if (p.status === 'Pending') extra.queueRank = await nextQueueRank();
    if (p.status === 'Approved' || p.status === 'Completed') {
      extra = { ...extra, approvedAt: new Date(p.pay === 'full' ? doneAt.getTime() - 9 * 86400000 : now), assignments: [{ lead: techId, helper: null }], technician: techId };
    }
    if (p.pay === 'full') {
      extra = {
        ...extra, paymentStatus: 'fully_paid', balancePaymentStatus: 'paid', balancePaid: true, balanceReferenceNumber: refNumber(),
        balanceProofFile: await storeProof(p.key), completedAt: doneAt, paymentEvents: [event('down', breakdown.downPayment), event('balance', breakdown.balance)],
      };
    }
    const booking = await createWithUniqueBookingId((bookingId) => Booking.create({ ...base, bookingId, status: p.status, ...extra, ...stamp }));
    summary.bookingsCreated += 1;
    if (p.status !== 'Pending') {
      await recordAudit({ actor: SEED_ACTOR, action: 'booking.approve', entityType: 'Booking', entityId: booking.bookingId, summary: 'Evaluator sample booking approved' });
      await recordAudit({ actor: SEED_ACTOR, action: 'payment.verify', entityType: 'Booking', entityId: booking.bookingId, summary: 'Evaluator sample down payment verified' });
    }
    if (p.pay === 'full') {
      await recordAudit({ actor: SEED_ACTOR, action: 'payment.verify', entityType: 'Booking', entityId: booking.bookingId, summary: 'Evaluator sample balance verified' });
      const report = await Report.create({
        bookingId: booking.bookingId, booking: booking._id, technicianId: techId, submittedBy: techId,
        workSummary: 'Cleaned the indoor unit and checked the cooling. Evaluator sample report.', partsUsed: 'None', recommendations: 'Clean again in three months.',
        laborHours: 2, issueResolution: 'Complete', followUpRequired: false, isFinal: true, clientConsent: { signedName: 'Evaluator Customer', signedAt: doneAt },
        submittedAt: doneAt, createdAt: doneAt, updatedAt: doneAt, ...marker(),
      });
      await Booking.updateOne({ _id: booking._id }, { $set: { reportId: report._id, reportSubmitted: true } });
      summary.reportsCreated += 1;
    }
  }

  // ---- the 3 month reminder: the real job, once. It looks at every customer, which is what the server does every midnight and at every start,
  // so on a live database it is left to the server (the Evaluator customer is flagged at the next start) rather than run from here.
  if (runReminders && !live) {
    const check = await runServiceReminderCheck(now);
    const sent = await deliverPendingServiceReminders();
    log(`The 3 month reminder job ran once: ${check.remindersCreated} flagged, ${sent.delivered} delivered.`);
  } else if (live) {
    log('Live database: the 3 month reminder job was not run from here. The server runs it at its next start and every midnight, and will flag the Evaluator customer.');
  }
  log(`Created ${summary.usersCreated} accounts, ${summary.bookingsCreated} bookings and ${summary.reportsCreated} report.`);
  return summary;
}

// ---- command line -----------------------------------------------------------------------------------------------------------------------

async function main() {
  const args = new Set(process.argv.slice(2));
  const audit = args.has('--audit');
  const live = args.has('--i-know-this-is-live');
  const readOnly = args.has('--show-existing');
  // the passwords are needed only to write accounts, and are checked BEFORE any connection is made
  if (!args.has('--cleanup') && !readOnly) {
    const read = readPasswords(process.env);
    if (!read.ok) { console.error(read.message); process.exit(1); }
  }
  const mongoose = require('mongoose');
  const { databaseNameOf, connectAudit } = require('./lib/auditDb');
  const { createGridFsStore } = require('../storage/fileStore');
  if (audit) {
    await connectAudit(mongoose);
  } else {
    require('dns').setServers(['8.8.8.8', '8.8.4.4']);
    require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
    // the database named in the connection string is checked BEFORE connecting: the flag, the variable, and an exact match
    const name = databaseNameOf(process.env.MONGO_URI);
    console.log(`Database named by the connection: ${name || '(none)'}`);
    const verdict = checkDatabase(name, { audit: false, live, liveName: process.env[LIVE_DB_VAR] });
    if (!verdict.ok) { console.error(verdict.message); process.exit(1); }
    await mongoose.connect(process.env.MONGO_URI);
  }
  try {
    await run({
      apply: args.has('--apply'), cleanup: args.has('--cleanup'), showExisting: readOnly, resetPasswords: args.has('--reset-passwords'), audit, live,
      dbName: mongoose.connection.name, store: createGridFsStore(),
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { run, checkDatabase, readPasswords, LIVE_DB_VAR, ALLOWLIST, ACCOUNTS, BATCH, SEED_ACTOR, PROOF_PNG, TECHNICIAN_PASSWORD_VAR, CUSTOMER_PASSWORD_VAR };
