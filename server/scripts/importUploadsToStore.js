/* eslint-disable no-console -- a command-line script: printing is its output */
// Copies the files in server/uploads (proofs and profile-images) into the GridFS file store, so they survive a host restart.
//
//   node scripts/importUploadsToStore.js                              dry run (default): reads only, changes nothing
//   node scripts/importUploadsToStore.js --apply --i-have-a-backup    copy the files that are not in the store yet
//
// The dry run prints counts, the total size, how many files are already in the store, files with an unknown extension, and files no
// record refers to. With --apply the files are copied under the same names, with metadata worked out from the record that refers to each
// one (a file nothing refers to becomes "legacy"). It NEVER deletes or changes a disk file, never overwrites a name already in the store,
// and is safe to run again. It never prints file contents or any secret.
//
// It always writes to GridFS (the "uploads" bucket of the database MONGO_URI points at), whatever FILE_STORE says. MONGO_URI comes from
// the environment (server/.env is read if the variable is not already set): point it at the database you mean, a backup copy first.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { createGridFsStore } = require('../storage/fileStore');
const { referenceMap, planImport, applyImport, describePlan } = require('../utils/uploadImport');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const HAS_BACKUP = args.has('--i-have-a-backup');
const UPLOADS = path.join(__dirname, '..', 'uploads');
const FOLDERS = ['proofs', 'profile-images'];

function readDisk() {
  const disk = [];
  FOLDERS.forEach((folder) => {
    const dir = path.join(UPLOADS, folder);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((name) => {
      const stat = fs.statSync(path.join(dir, name));
      if (stat.isFile() && name !== '.gitkeep') disk.push({ name, folder, size: stat.size });
    });
  });
  return disk;
}

async function main() {
  if (APPLY && !HAS_BACKUP) {
    console.error('Refusing to run with --apply: this writes files into the database. Take a backup first, then run again with both --apply and --i-have-a-backup.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Database: ${mongoose.connection.name}`);
  const db = mongoose.connection;
  const store = createGridFsStore();

  const [bookings, reports, users] = await Promise.all([
    db.collection('bookings').find({}, { projection: { bookingId: 1, proofFile: 1, balanceProofFile: 1, 'discount.idFile': 1, 'refund.proofFile': 1, unitPurchaseProof: 1 } }).toArray(),
    db.collection('reports').find({}, { projection: { bookingId: 1, signedFormPhoto: 1 } }).toArray(),
    db.collection('users').find({}, { projection: { profileImage: 1 } }).toArray(),
  ]);
  const inStore = new Set((await store.list()).map((f) => f.name));
  const plan = planImport({ disk: readDisk(), inStore, references: referenceMap({ bookings, reports, users }) });
  describePlan(plan).forEach((line) => console.log(line));

  if (!APPLY) {
    console.log('Dry run: nothing was changed. To copy the files, run again with --apply --i-have-a-backup.');
  } else {
    const result = await applyImport({ plan, store, readFile: (file) => fs.promises.readFile(path.join(UPLOADS, file.folder, file.name)) });
    console.log(`Copied: ${result.copied}. Skipped (already there): ${result.skippedExisting}. Failed: ${result.failed.length}.`);
    result.failed.slice(0, 20).forEach((f) => console.log(`  ${f.name}: ${f.reason}`));
    console.log('No disk file was deleted or changed.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
