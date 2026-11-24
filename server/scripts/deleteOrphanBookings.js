/* eslint-disable no-console -- a command-line script: printing is its output */
// Permanently deletes the bookings whose customer account no longer exists (the ones the admin pages show as "Deleted customer"), together with
// their service reports, back job claims and notifications. Nothing else is touched. This cannot be undone, and reports and history lose these rows.
//
//   node scripts/deleteOrphanBookings.js --audit                    dry run on the test database CZAMS_audit_test: lists what would go, writes nothing
//   node scripts/deleteOrphanBookings.js --audit --apply            deletes them from the test database
//   node scripts/deleteOrphanBookings.js --i-know-this-is-live      dry run on the database MONGO_URI points at
//   node scripts/deleteOrphanBookings.js --i-know-this-is-live --apply --backup-done
//                                                                    deletes them there, but only with all of these true: ORPHAN_DB_NAME is set to
//                                                                    the exact database name, --backup-done is given (take a backup first, for example
//                                                                    node scripts/backupToJson.js), and the connected database has that name
//
// Without --audit the connection string comes from the MONGO_URI environment variable, else server/.env. It is never printed: only the database
// NAME is. Files that were uploaded for these bookings (proofs, photos) are not removed; the script says how many bookings had any.
const fs = require('fs');
const path = require('path');
const { parse } = require('dotenv');
const mongoose = require('mongoose');

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const BackJob = require('../models/BackJob');
const Notification = require('../models/Notification');

const args = new Set(process.argv.slice(2));
const AUDIT = args.has('--audit');
const LIVE = args.has('--i-know-this-is-live');
const APPLY = args.has('--apply');
const BACKUP_DONE = args.has('--backup-done');
const LIVE_DB_VAR = 'ORPHAN_DB_NAME';

// null when the run may go ahead, otherwise the sentence that says why not. Pure, so a test can check every case.
function refusal({ audit, live, apply, backupDone, connectedName, liveName }) {
  if (audit && live) return 'Choose one: --audit (the test database) or --i-know-this-is-live, not both.';
  if (audit) return connectedName === 'CZAMS_audit_test' ? null : `Refusing to run: --audit needs the database CZAMS_audit_test, but this one is named "${connectedName}".`;
  if (!live) return 'Refusing to run: give --audit for the test database, or --i-know-this-is-live for the database MONGO_URI points at.';
  if (!liveName) return `Refusing to run: set ${LIVE_DB_VAR} to the exact name of the database you mean.`;
  if (connectedName !== liveName) return `Refusing to run: connected to "${connectedName}", but ${LIVE_DB_VAR} says "${liveName}".`;
  if (apply && !backupDone) return 'Refusing to delete: take a backup first (node scripts/backupToJson.js), then add --backup-done.';
  return null;
}

function connectionString() {
  if (process.env.MONGO_URI) return process.env.MONGO_URI;
  const file = path.join(__dirname, '..', '.env');
  return fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')).MONGO_URI : undefined;
}

async function connect() {
  if (AUDIT) {
    const { connectAudit } = require('./lib/auditDb'); // refuses any database but CZAMS_audit_test, before and after connecting
    await connectAudit(mongoose);
    return;
  }
  const uri = connectionString();
  if (!uri) throw new Error('No connection string: set MONGO_URI or server/.env.');
  await mongoose.connect(uri);
}

async function main() {
  // refused before any connection when the flags alone are wrong (the database name is checked again once connected)
  const early = refusal({ audit: AUDIT, live: LIVE, apply: APPLY, backupDone: BACKUP_DONE, connectedName: AUDIT ? 'CZAMS_audit_test' : process.env[LIVE_DB_VAR], liveName: process.env[LIVE_DB_VAR] });
  if (early) throw new Error(early);
  await connect();
  const connectedName = mongoose.connection.name;
  const problem = refusal({ audit: AUDIT, live: LIVE, apply: APPLY, backupDone: BACKUP_DONE, connectedName, liveName: process.env[LIVE_DB_VAR] });
  if (problem) throw new Error(problem);
  console.log(`Database: ${connectedName}${AUDIT ? ' (test)' : ' (matches ORPHAN_DB_NAME)'}`);

  const owners = new Set((await User.find({}).select('_id').lean()).map((u) => String(u._id)));
  const bookings = await Booking.find({}).select('bookingId customer status date refund.status paymentStatus problemMedia proofFile').lean();
  const orphans = bookings.filter((b) => !owners.has(String(b.customer)));
  const byStatus = orphans.reduce((acc, b) => ({ ...acc, [b.status]: (acc[b.status] || 0) + 1 }), {});
  const withFiles = orphans.filter((b) => b.proofFile || b.problemMedia).length;
  const openRefunds = orphans.filter((b) => b.refund && b.refund.status === 'Pending').length;

  console.log(`Bookings in the database: ${bookings.length}. With no customer account: ${orphans.length}.`);
  console.log('By status:', Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(', ') || 'none');
  orphans.slice(0, 50).forEach((b) => console.log(`  ${b.bookingId}  ${b.status}  ${b.date}  ${b.paymentStatus || ''}`));
  if (orphans.length > 50) console.log(`  ... and ${orphans.length - 50} more`);
  if (openRefunds > 0) console.log(`Note: ${openRefunds} of them have a refund still pending. Deleting them removes that record of money owed.`);
  if (withFiles > 0) console.log(`Note: ${withFiles} had uploaded files; the files themselves are not removed.`);

  if (orphans.length === 0) return console.log('Nothing to delete.');
  if (!APPLY) return console.log('Dry run: nothing was deleted. Add --apply to delete them.');

  const ids = orphans.map((b) => b.bookingId);
  const objectIds = orphans.map((b) => b._id);
  const reports = await Report.deleteMany({ bookingId: { $in: ids } });
  const claims = await BackJob.deleteMany({ $or: [{ originalBookingId: { $in: ids } }, { originalBooking: { $in: objectIds } }] });
  const notes = await Notification.deleteMany({ $or: [{ relatedBookingId: { $in: ids } }, { relatedBooking: { $in: objectIds } }] });
  const removed = await Booking.deleteMany({ _id: { $in: objectIds } });
  console.log(`Deleted: ${removed.deletedCount} bookings, ${reports.deletedCount} service reports, ${claims.deletedCount} back job claims, ${notes.deletedCount} notifications.`);
}

if (require.main === module) {
  main()
    .catch((err) => { console.error('Failed:', err.message); process.exitCode = 1; })
    .finally(async () => { try { await mongoose.disconnect(); } catch { /* not connected */ } });
}

module.exports = { refusal };
