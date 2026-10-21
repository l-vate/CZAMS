const cron = require('node-cron');
const Booking = require('../models/Booking');
const { getStore } = require('../storage/fileStore');
const { recordAudit } = require('../utils/audit');
const { runIdPhotoRetention } = require('../utils/idPhotoRetention');
const { ID_PHOTO_RETENTION_DAYS } = require('../constants/discount');
const { TIMEZONE } = require('../utils/timeBlocks');

// Once a day, on Manila time, and once right at start-up (a host that sleeps catches up when it wakes). Set ID_PHOTO_RETENTION_DRY_RUN=true
// to only log how many photos are due, without deleting anything. The log carries counts only.
const isDryRun = () => String(process.env.ID_PHOTO_RETENTION_DRY_RUN || '').toLowerCase() === 'true';

async function safeRun() {
  try {
    const result = await runIdPhotoRetention({ Booking, store: getStore(), audit: recordAudit, retentionDays: ID_PHOTO_RETENTION_DAYS, dryRun: isDryRun() });
    // eslint-disable-next-line no-console -- one summary line of counts, no file names and no people
    console.log(`ID photo retention${result.dryRun ? ' (dry run)' : ''}: ${result.checked} checked, ${result.due} due, ${result.deleted} deleted.`);
  } catch (err) {
    console.error('ID photo retention check failed:', err.message);
  }
}

function startIdPhotoRetentionSchedule() {
  cron.schedule('30 2 * * *', safeRun, { timezone: TIMEZONE });
  safeRun();
}

module.exports = { startIdPhotoRetentionSchedule, safeRun };
