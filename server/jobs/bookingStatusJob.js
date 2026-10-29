const cron = require('node-cron');
const { DAY_START_JOB_SCHEDULE } = require('../constants/bookingLifecycle');
const { runDayStart, expirePendingBookings, startApprovedBookings } = require('../utils/bookingLifecycle');
const { TIMEZONE } = require('../utils/timeBlocks');

// The day start job. At the start of a booking's service day (Asia/Manila):
//   1. a Pending booking nobody approved is cancelled automatically, and its refund request opens (utils/bookingLifecycle.js);
//   2. an Approved booking becomes In Progress by itself (nobody presses a button), with no email to the customer.
// Completed also happens by itself, when the technician submits the service report (POST /api/reports).
//
// It runs shortly after midnight, once an hour, and once as soon as the server starts. The hourly run and the start-up run are the catch-up: a
// host that sleeps (a free instance) and misses midnight does the work as soon as it is awake, and every rule is a conditional update, so a
// run that finds nothing to do does nothing and two runs at once cannot do anything twice. `now` is a parameter so the rule can be tested
// with a fake clock. The log says counts only, never a name or a booking number.
async function runBookingStatusCheck(now = new Date(), options = {}) {
  return runDayStart({ now, ...options });
}

async function safeRun() {
  try {
    const { dryRun, expiry, start } = await runBookingStatusCheck();
    if (expiry.expired > 0 || start.started > 0 || dryRun) {
      // eslint-disable-next-line no-console -- one line of counts a day, not debugging
      console.log(`Day start job${dryRun ? ' (dry run)' : ''}: ${expiry.expired} expired, ${expiry.refundRequests} refund requests opened, ${start.started} started.`);
    }
  } catch (err) {
    console.error('The day start job failed:', err.message);
  }
}

function startBookingStatusSchedule() {
  cron.schedule(DAY_START_JOB_SCHEDULE.midnight, safeRun, { timezone: TIMEZONE });
  cron.schedule(DAY_START_JOB_SCHEDULE.hourly, safeRun, { timezone: TIMEZONE });
  safeRun();
}

module.exports = { runBookingStatusCheck, expirePendingBookings, startApprovedBookings, startBookingStatusSchedule };
