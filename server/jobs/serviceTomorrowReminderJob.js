const cron = require('node-cron');
const { SERVICE_TOMORROW_REMINDER_SCHEDULE } = require('../constants/serviceTomorrowReminder');
const { runServiceTomorrowReminders } = require('../utils/serviceTomorrowReminder');
const { TIMEZONE } = require('../utils/timeBlocks');

// The "Your service is tomorrow" job. It runs once an hour (Asia/Manila) and once as soon as the server starts, the same pattern as the day start
// job (jobs/bookingStatusJob.js): a host that sleeps and misses a run does the work when it wakes, a booking approved late in the day is reminded
// at the next run, and every send is a conditional update on the booking, so a run that finds nothing to do does nothing and two runs at once
// cannot remind twice. The rules live in utils/serviceTomorrowReminder.js; this file only SCHEDULES. The log says counts only, never a name or a
// booking number. The 3-month "book again" reminder (jobs/serviceReminderJob.js) is a different job and is not touched.
async function safeRun() {
  try {
    const result = await runServiceTomorrowReminders();
    if (result.reminded > 0 || result.failed > 0) {
      // eslint-disable-next-line no-console -- one line of counts per run that did something, not debugging
      console.log(`Service tomorrow reminders: ${result.reminded} reminded, ${result.customersNotified} customers, ${result.techniciansNotified} technician notes, ${result.failed} failed.`);
    }
  } catch (err) {
    console.error('The service tomorrow reminder job failed:', err.message);
  }
}

function startServiceTomorrowReminderSchedule() {
  cron.schedule(SERVICE_TOMORROW_REMINDER_SCHEDULE, safeRun, { timezone: TIMEZONE });
  safeRun();
}

module.exports = { startServiceTomorrowReminderSchedule, runServiceTomorrowReminders };
