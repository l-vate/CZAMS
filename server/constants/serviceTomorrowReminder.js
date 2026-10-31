// The "Your service is tomorrow" reminder (owner decision): a customer whose Approved booking is the next day, and the technicians on it, are
// reminded. A reminder only: it never books, changes, cancels or charges anything. Read by utils/serviceTomorrowReminder.js and
// jobs/serviceTomorrowReminderJob.js. All times are Asia/Manila.
//
// SERVICE_TOMORROW_REMINDER_ENABLED  false stops the reminders without touching the code.
// SERVICE_TOMORROW_REMINDER_HOUR     a booking is reminded from this hour (0 to 23) on the day before its service day.
// SERVICE_TOMORROW_REMINDER_BATCH    bookings handled per page, so one run never loads everything at once.
// The job runs once an hour and once at server start, so a host that was asleep, or a booking approved late in the day, is caught up at the
// next run; the stored `serviceReminderSentFor` date makes sure each booking date is reminded once.
const SERVICE_TOMORROW_REMINDER_ENABLED = true;
const SERVICE_TOMORROW_REMINDER_HOUR = 8;
const SERVICE_TOMORROW_REMINDER_BATCH = 100;
const SERVICE_TOMORROW_REMINDER_SCHEDULE = '35 * * * *';

module.exports = {
  SERVICE_TOMORROW_REMINDER_ENABLED,
  SERVICE_TOMORROW_REMINDER_HOUR,
  SERVICE_TOMORROW_REMINDER_BATCH,
  SERVICE_TOMORROW_REMINDER_SCHEDULE,
};
