/* eslint-disable no-console -- a command-line script: printing is its output */
// Checks whether any booking has more than one OPEN back job claim (status Scheduled or Not Covered), and (only when
// none has) prepares the database for the one-open-claim-per-booking index.
//
//   node scripts/checkDuplicateBackJobs.js                              dry run (default): reads only, changes nothing
//   node scripts/checkDuplicateBackJobs.js --apply --i-have-a-backup    mark each claim open or closed (isOpen) and build the unique index
//
// It never deletes or edits a claim except to set the isOpen flag, and it does that only when there are no duplicates.
// If duplicates exist it lists them and stops: decide by hand which claim to keep (for example mark the extra one
// Reviewed), then run it again. Connects with MONGO_URI from the environment (server/.env is read if the variable is not
// already set), so point it at the database you mean to check.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { OPEN_BACK_JOB_STATUSES } = require('../constants/backJobStatus');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const HAS_BACKUP = args.has('--i-have-a-backup');
const INDEX_NAME = 'originalBookingId_open_unique';

async function main() {
  if (APPLY && !HAS_BACKUP) {
    console.error('Refusing to run with --apply: this changes claims and an index. Take a backup first, then run again with both --apply and --i-have-a-backup.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Database: ${mongoose.connection.name}`);
  const claims = mongoose.connection.collection('backjobs');

  const duplicates = await claims.aggregate([
    { $match: { status: { $in: OPEN_BACK_JOB_STATUSES } } },
    { $group: { _id: '$originalBookingId', count: { $sum: 1 }, backJobIds: { $push: '$backJobId' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();

  if (duplicates.length > 0) {
    console.log(`Found ${duplicates.length} booking(s) with more than one open claim. Nothing was changed.`);
    duplicates.forEach((d) => console.log(`  ${d._id}: ${d.count} claims (${d.backJobIds.join(', ')})`));
    console.log('Close the extra claims by hand, then run this again.');
    await mongoose.disconnect();
    return;
  }
  console.log('No booking has more than one open claim.');

  const missingFlag = await claims.countDocuments({ isOpen: { $exists: false } });
  console.log(`${missingFlag} claim(s) have no isOpen flag yet.`);
  const indexes = await claims.indexes();
  const existing = indexes.find((i) => i.name === INDEX_NAME);
  console.log(existing ? `The ${INDEX_NAME} index already exists.` : `The ${INDEX_NAME} index does not exist yet.`);

  if (!APPLY) {
    console.log('Dry run. To set the flags and build the index, run again with --apply --i-have-a-backup.');
  } else {
    await claims.updateMany({ isOpen: { $exists: false }, status: { $in: OPEN_BACK_JOB_STATUSES } }, { $set: { isOpen: true } });
    await claims.updateMany({ isOpen: { $exists: false } }, { $set: { isOpen: false } });
    if (!existing) {
      await claims.createIndex({ originalBookingId: 1 }, { unique: true, partialFilterExpression: { isOpen: true }, name: INDEX_NAME });
    }
    console.log('Claims are marked open or closed and the unique index is in place.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
