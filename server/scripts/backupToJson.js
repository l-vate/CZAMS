/* eslint-disable no-console -- a command-line script: printing is its output */
// Read only backup: exports every collection (GridFS uploads.files and uploads.chunks included) to its own EJSON file in a new
// timestamped folder outside the project.
//
//   node scripts/backupToJson.js                  writes to D:\CZA\BACKUPS\CZAMS-<date and time>
//   node scripts/backupToJson.js --out <folder>   writes to <folder>\CZAMS-<date and time> instead
//
// It only reads from the database named in server/.env (MONGO_URI is used if already set in the environment). It never writes, updates or
// deletes anything there. It prints only the database name, each collection name with its document count and the output folder. It never
// prints the connection string or any document. The files hold real data: keep them out of git.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { backupDatabase, backupFolder } = require('../utils/backupToJson');

const DEFAULT_BASE = 'D:\\CZA\\BACKUPS';

function outArg() {
  const i = process.argv.indexOf('--out');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : DEFAULT_BASE;
}

async function main() {
  const baseDir = outArg();
  backupFolder(baseDir); // check the destination before touching the database

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Database: ${mongoose.connection.name}`);
  const { folder, collections } = await backupDatabase(mongoose.connection.db, { baseDir });
  collections.forEach((c) => console.log(`  ${c.name}: ${c.count} documents`));
  console.log(`Output folder: ${folder}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
