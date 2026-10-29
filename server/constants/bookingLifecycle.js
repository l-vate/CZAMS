// Owner decisions about a booking's day, each one a number or text in this file. Read by jobs/bookingStatusJob.js, utils/bookingLifecycle.js,
// utils/noShow.js and routes/bookingRoutes.js.
//
// The jobs: the day start job (expire unconfirmed Pending bookings, start Approved ones) runs shortly after midnight Asia/Manila, once an
// hour (so a run missed while a host slept is caught up) and once as soon as the server starts.
//
// PENDING_EXPIRY_GRACE_DAYS  (OWNER DECISION, default 0)
//   A Pending booking that has not been approved by the start of its booked day is cancelled automatically. This many extra days are
//   allowed before that happens: 0 means the booked day itself is too late, 1 means the owner has until the end of the booked day.
//
// NO_SHOW_REPORT_GRACE_MINUTES  (default 60)
//   The customer can report that the technicians did not come once this many minutes have passed since the booked time block started
//   (Morning 08:00, Afternoon 13:00, from constants/timeBlocks.json).
//
// NO_SHOW_REPORT_EXTRA_DAYS  (default 0)
//   0: a no show can only be reported on the service day. 1: also on the following day.
const DAY_START_JOB_SCHEDULE = Object.freeze({
  midnight: '5 0 * * *',
  hourly: '20 * * * *',
});

const PENDING_EXPIRY_GRACE_DAYS = 0;
const EXPIRY_BATCH_SIZE = 100;
const NO_SHOW_REPORT_GRACE_MINUTES = 60;
const NO_SHOW_REPORT_EXTRA_DAYS = 0;
const NO_SHOW_NOTE_MAX = 300;
const NO_SHOW_REASON_MIN = 3;
const NO_SHOW_REASON_MAX = 300;

const EXPIRY_REASON = 'Expired: not confirmed before the booked date';

// Booking.noShow.status values, exactly as stored.
const NO_SHOW_STATUS = Object.freeze({
  NONE: 'None',
  REPORTED: 'Reported',
  CONFIRMED: 'Confirmed',
  RESCHEDULED: 'Rescheduled',
  REJECTED: 'Rejected',
});
const NO_SHOW_STATUS_VALUES = Object.freeze(Object.values(NO_SHOW_STATUS));

module.exports = {
  DAY_START_JOB_SCHEDULE,
  PENDING_EXPIRY_GRACE_DAYS,
  EXPIRY_BATCH_SIZE,
  NO_SHOW_REPORT_GRACE_MINUTES,
  NO_SHOW_REPORT_EXTRA_DAYS,
  NO_SHOW_NOTE_MAX,
  NO_SHOW_REASON_MIN,
  NO_SHOW_REASON_MAX,
  EXPIRY_REASON,
  NO_SHOW_STATUS,
  NO_SHOW_STATUS_VALUES,
};
