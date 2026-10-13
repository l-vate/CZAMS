/* eslint-disable no-console -- a command-line script: printing is its output */
// Lists the files in the file store that no booking, service report or user refers to (left behind by an upload that was refused before
// the clean-up existed, or by a deleted record).
//
//   node scripts/listOrphanUploads.js
//
// READ ONLY. It has no option to delete or move anything: look at the list, then remove files by hand if you agree. It reads whichever
// store is configured (FILE_STORE: gridfs, or disk for the local folder) and the database MONGO_URI points at (server/.env is read if the
// variable is not already set). Run it only against the database the files belong to, or files of another copy are listed as orphans.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { buildStore } = require('../storage/fileStore');
const { findOrphans, BOOKING_FILE_FIELDS, REPORT_FILE_FIELDS } = require('../utils/orphanUploads');

const project = (fields) => Object.fromEntries(fields.map((f) => [f, 1]));

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Database: ${mongoose.connection.name}`);
  const store = buildStore();
  console.log(`File store: ${store.kind}`);
  const stored = await store.list();
  const bookings = await mongoose.connection.collection('bookings').find({}, { projection: project(BOOKING_FILE_FIELDS) }).toArray();
  const reports = await mongoose.connection.collection('reports').find({}, { projection: project(REPORT_FILE_FIELDS) }).toArray();
  const users = await mongoose.connection.collection('users').find({}, { projection: { profileImage: 1 } }).toArray();

  const orphans = findOrphans({ filesOnDisk: stored.map((f) => f.name), bookings, reports, users });
  const bySize = new Map(stored.map((f) => [f.name, f]));
  console.log(`${stored.length} file(s) in the store, ${orphans.length} not referenced by any booking, report or user. Nothing was changed.`);
  orphans.forEach((name) => {
    const file = bySize.get(name);
    console.log(`  ${name}  ${file.size} bytes  ${new Date(file.uploadedAt).toISOString()}  ${(file.metadata && file.metadata.kind) || 'legacy'}`);
  });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
