/* eslint-disable no-console -- a command-line script: printing is its output */
// Puts the unique index on reports.bookingId right when an older plain index of the same name is in the way (the unique one then silently
// fails to build, and nothing stops two reports for one booking).
//
//   node scripts/fixReportsIndex.js                              dry run (default): reads only, says what it would do
//   node scripts/fixReportsIndex.js --apply --i-have-a-backup    drop the plain bookingId index, then build the unique one
//
// It only ever drops the plain bookingId index, and only when no booking has two reports. If any booking has more than one report it lists
// them and stops: decide by hand which report to keep. It never deletes or edits a report. Connects with MONGO_URI from the environment
// (server/.env is read if the variable is not already set), so point it at the database you mean. It never prints a connection string.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { inspect, decide, applyFix, EXPLAIN } = require('../utils/reportsIndex');

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

  const state = await inspect(reports);
  console.log(`Plain bookingId index: ${state.plain ? `yes (${state.plain.name})` : 'no'}`);
  console.log(`Unique bookingId index: ${state.unique ? 'yes' : 'no'}`);
  console.log(`Bookings with more than one report: ${state.duplicates.length}`);
  state.duplicates.forEach((d) => console.log(`  ${d._id}: ${d.count} reports (${d.reportIds.join(', ')})`));
  console.log(EXPLAIN[decide(state)]);

  if (!APPLY) {
    console.log('Dry run: nothing was changed. To apply, run again with --apply --i-have-a-backup.');
  } else {
    const { done } = await applyFix(reports, state);
    done.forEach((line) => console.log(`Done: ${line}`));
    if (done.length === 0) console.log('Nothing was changed.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
