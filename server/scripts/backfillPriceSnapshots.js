/* eslint-disable no-console -- a command-line script: printing is its output */
// Reports how many old bookings have no price snapshot, and what the snapshot of each would be.
//
//   node scripts/backfillPriceSnapshots.js                              dry run (default): reads only, changes nothing
//   node scripts/backfillPriceSnapshots.js --apply --i-have-a-backup    write the snapshots
//
// WARNING: a snapshot made now freezes TODAY'S service price on the booking. If a service price was changed after
// the booking was made, the snapshot will NOT be the price the customer saw. A booking with no snapshot keeps following
// the service's current price, which is the same number until the price is next edited. Only back-fill after the
// owner agrees, and take a backup first. Connects with MONGO_URI from the environment (server/.env is read if the
// variable is not already set), so point it at the database you mean to check.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { buildPriceSnapshot } = require('../utils/priceSnapshot');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const HAS_BACKUP = args.has('--i-have-a-backup');

async function main() {
  if (APPLY && !HAS_BACKUP) {
    console.error('Refusing to run with --apply: this freezes prices on old bookings. Take a backup first, then run again with both --apply and --i-have-a-backup.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Database: ${mongoose.connection.name}`);
  const bookings = mongoose.connection.collection('bookings');
  const services = mongoose.connection.collection('services');

  const missing = await bookings.find({ priceSnapshot: { $exists: false } }).toArray();
  console.log(`${missing.length} booking(s) have no price snapshot.`);
  const serviceById = new Map((await services.find({}).toArray()).map((s) => [String(s._id), s]));

  let noService = 0;
  let writable = 0;
  const examples = [];
  const updates = [];
  missing.forEach((b) => {
    const service = serviceById.get(String(b.service));
    const units = (b.units && b.units.length > 0) ? b.units : (b.unitTypes || []).map((type) => ({ type, quantity: 1 }));
    if (!service || units.length === 0) { noService += 1; return; }
    const snapshot = buildPriceSnapshot(service, units.map((u) => ({ type: u.type, quantity: u.quantity || 1 })));
    writable += 1;
    if (examples.length < 5) examples.push({ bookingId: b.bookingId, status: b.status, lines: snapshot.lines });
    updates.push({ updateOne: { filter: { _id: b._id }, update: { $set: { priceSnapshot: snapshot } } } });
  });

  console.log(`${writable} could be given a snapshot from the CURRENT service price. ${noService} cannot (the service is gone or the booking lists no units).`);
  examples.forEach((e) => console.log(`  ${e.bookingId} (${e.status}): ${e.lines.map((l) => `${l.quantity} x ${l.type} at ${l.unitPrice}`).join(', ')}`));
  console.log('Warning: back-filling freezes today\'s prices. It does not recover the price the customer saw.');

  if (!APPLY) {
    console.log('Dry run. Nothing was changed. To write the snapshots, run again with --apply --i-have-a-backup.');
  } else if (updates.length > 0) {
    const result = await bookings.bulkWrite(updates, { ordered: false });
    console.log(`Wrote ${result.modifiedCount} snapshot(s).`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
