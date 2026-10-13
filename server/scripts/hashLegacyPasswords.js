/* eslint-disable no-console -- a command-line script: printing is its output */
// One-off migration: hash user passwords that are still stored as plain text.
//
//   node scripts/hashLegacyPasswords.js                              dry run (default): changes nothing
//   node scripts/hashLegacyPasswords.js --apply --i-have-a-backup    hash them (bcrypt, cost 10)
//
// A stored password counts as plain text when it does not start with "$2" (a bcrypt hash always
// does). Connects with MONGO_URI from the environment (server/.env is read if the variable is not
// already set). Never prints or logs a password; emails are partly masked (ab***@gmail.com).
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as server.js, for Atlas "mongodb+srv" lookups
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { hashPassword, isBcryptHash } = require('../utils/password');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const HAS_BACKUP = args.has('--i-have-a-backup');

function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

async function main() {
  if (APPLY && !HAS_BACKUP) {
    console.error('Refusing to run with --apply: this changes stored passwords and cannot be undone.');
    console.error('Take a database backup first, then run again with both --apply and --i-have-a-backup.');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to database: ${mongoose.connection.name}`);
  console.log(APPLY ? 'Mode: APPLY (passwords will be hashed)' : 'Mode: DRY RUN (nothing will be changed)');

  // Read through the raw collection so no schema default or hook can touch the value.
  const users = mongoose.connection.db.collection('users');
  const legacy = await users
    .find({ password: { $type: 'string', $not: /^\$2/, $ne: '' } })
    .project({ email: 1, password: 1 })
    .toArray();

  const total = await users.countDocuments();
  console.log(`Users in total: ${total}`);
  console.log(`Users with a plain-text password: ${legacy.length}`);
  legacy.forEach((u) => console.log(`  ${maskEmail(u.email)}`));

  if (!APPLY) {
    console.log('Dry run finished. Nothing was changed. To convert them, run again with --apply --i-have-a-backup.');
    return;
  }

  let converted = 0;
  let skipped = 0;
  for (const u of legacy) {
    if (isBcryptHash(u.password)) { skipped += 1; continue; }
    const hashed = await hashPassword(u.password);
    // Only update if the stored value is still the one we read, so a password changed in the
    // meantime is never overwritten.
    const result = await users.updateOne({ _id: u._id, password: u.password }, { $set: { password: hashed } });
    if (result.modifiedCount === 1) converted += 1; else skipped += 1;
  }
  console.log(`Converted: ${converted}. Skipped (changed meanwhile or already hashed): ${skipped}.`);
}

main()
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
