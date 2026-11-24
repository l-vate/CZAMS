/* eslint-disable no-console -- a command-line script: printing is its output */
// Permanently deletes every chat: all conversations (customer and technician with the admin), all their messages, and the "new chat message"
// notifications. Nothing else is touched (no booking, account, payment or report). This cannot be undone. For clearing the old test chats before a demo.
//
//   node scripts/clearChats.js --audit                    dry run on the test database CZAMS_audit_test: counts only, writes nothing
//   node scripts/clearChats.js --audit --apply            deletes the chats from the test database
//   node scripts/clearChats.js --i-know-this-is-live      dry run on the database MONGO_URI points at
//   node scripts/clearChats.js --i-know-this-is-live --apply --backup-done
//                                                          deletes them there, but only with all of these true: CHAT_DB_NAME is set to the exact database
//                                                          name, --backup-done is given (take a backup first, for example node scripts/backupToJson.js), and
//                                                          the connected database has that name
//
// Without --audit the connection string comes from the MONGO_URI environment variable, else server/.env. It is never printed: only the database NAME is.
const fs = require('fs');
const path = require('path');
const { parse } = require('dotenv');
const mongoose = require('mongoose');

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');

const args = new Set(process.argv.slice(2));
const AUDIT = args.has('--audit');
const LIVE = args.has('--i-know-this-is-live');
const APPLY = args.has('--apply');
const BACKUP_DONE = args.has('--backup-done');
const LIVE_DB_VAR = 'CHAT_DB_NAME';

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
  console.log(`Database: ${connectedName}${AUDIT ? ' (test)' : ' (matches CHAT_DB_NAME)'}`);

  const chatNotes = { type: NOTIFICATION_TYPE.CHAT_MESSAGE };
  const [conversations, messages, notes] = await Promise.all([Conversation.countDocuments({}), Message.countDocuments({}), Notification.countDocuments(chatNotes)]);
  console.log(`Chats in the database: ${conversations} conversations, ${messages} messages, ${notes} chat notifications.`);
  if (conversations + messages + notes === 0) return console.log('Nothing to delete.');
  if (!APPLY) return console.log('Dry run: nothing was deleted. Add --apply to delete them.');

  const m = await Message.deleteMany({});
  const c = await Conversation.deleteMany({});
  const n = await Notification.deleteMany(chatNotes);
  console.log(`Deleted: ${c.deletedCount} conversations, ${m.deletedCount} messages, ${n.deletedCount} chat notifications.`);
}

if (require.main === module) {
  main()
    .catch((err) => { console.error('Failed:', err.message); process.exitCode = 1; })
    .finally(async () => { try { await mongoose.disconnect(); } catch { /* not connected */ } });
}

module.exports = { refusal };
