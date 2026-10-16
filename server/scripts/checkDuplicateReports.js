/* eslint-disable no-console -- a command-line script: printing is its output */
// Checks whether any booking has more than one service report, and (only when it has none)
// switches the reports.bookingId index from a plain index to a unique one.
//
//   node scripts/checkDuplicateReports.js                              dry run (default): reads only, changes nothing
//   node scripts/checkDuplicateReports.js --apply --i-have-a-backup    drop the plain bookingId index and build the unique one
//
// It never deletes or edits a report. If duplicates exist it lists them and stops: decide by hand
// which report to keep, then run it again. Connects with MONGO_URI from the environment (server/.env
// is read if the variable is not already set), so point it at the database you mean to check.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const HAS_BACKUP = args.has('--i-have-a-backup');

async function main() {
  if (APPLY && !HAS_BACKUP) {
    console.error('Refusing to run with --apply: this changes an index. Take a backup first, then run again with both --apply and --i-have-a-backup.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Database: ${mongoose.connection.name}`);
  const reports = mongoose.connection.collection('reports');

  const duplicates = await reports.aggregate([
    { $group: { _id: '$bookingId', count: { $sum: 1 }, reportIds: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();

  if (duplicates.length > 0) {
    console.log(`Found ${duplicates.length} booking(s) with more than one report. Nothing was changed.`);
    duplicates.forEach((d) => console.log(`  ${d._id}: ${d.count} reports (${d.reportIds.join(', ')})`));
    console.log('Keep one report per booking by hand, then run this again.');
    await mongoose.disconnect();
    return;
  }
  console.log('No booking has more than one report.');

  const indexes = await reports.indexes();
  const onBooking = indexes.find((i) => i.key && Object.keys(i.key).length === 1 && i.key.bookingId === 1);
  console.log(onBooking ? `Current bookingId index: ${onBooking.name}, unique: ${onBooking.unique === true}` : 'There is no bookingId index yet.');

  if (onBooking && onBooking.unique === true) {
    console.log('Already unique. Nothing to do.');
  } else if (!APPLY) {
    console.log('Dry run. To make it unique, run again with --apply --i-have-a-backup.');
  } else {
    if (onBooking) await reports.dropIndex(onBooking.name);
    await reports.createIndex({ bookingId: 1 }, { unique: true });
    console.log('The bookingId index is now unique.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
