/* eslint-disable no-console -- a command-line script: printing is its output */
// Lists the files in uploads/proofs that no booking or service report refers to (left behind by an upload that was refused before
// the clean-up existed, or by a deleted record).
//
//   node scripts/listOrphanUploads.js
//
// READ ONLY. It has no option to delete or move anything: look at the list, then remove files by hand if you agree. Connects with
// MONGO_URI from the environment (server/.env is read if the variable is not already set), so point it at the database you mean to
// check. Run it only when every upload belongs to that same database, or files of another copy will be listed as orphans.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { findOrphans, BOOKING_FILE_FIELDS, REPORT_FILE_FIELDS } = require('../utils/orphanUploads');

const PROOFS_DIR = path.join(__dirname, '..', 'uploads', 'proofs');
const project = (fields) => Object.fromEntries(fields.map((f) => [f, 1]));

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Database: ${mongoose.connection.name}`);
  const filesOnDisk = fs.existsSync(PROOFS_DIR) ? fs.readdirSync(PROOFS_DIR).filter((n) => fs.statSync(path.join(PROOFS_DIR, n)).isFile()) : [];
  const bookings = await mongoose.connection.collection('bookings').find({}, { projection: project(BOOKING_FILE_FIELDS) }).toArray();
  const reports = await mongoose.connection.collection('reports').find({}, { projection: project(REPORT_FILE_FIELDS) }).toArray();

  const orphans = findOrphans({ filesOnDisk, bookings, reports });
  console.log(`${filesOnDisk.length} file(s) in uploads/proofs, ${orphans.length} not referenced by any booking or report. Nothing was changed.`);
  orphans.forEach((name) => {
    const stat = fs.statSync(path.join(PROOFS_DIR, name));
    console.log(`  ${name}  ${stat.size} bytes  ${stat.mtime.toISOString()}`);
  });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
