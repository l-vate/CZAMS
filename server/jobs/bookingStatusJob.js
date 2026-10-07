const { BOOKING_STATUS } = require('../constants/bookingStatus');
const cron = require('node-cron');
const Booking = require('../models/Booking');
const { blockStartInstant, TIMEZONE } = require('../utils/timeBlocks');

// Approved -> In Progress happens by itself when the booking's time block starts
// (Morning 08:00, Afternoon 13:00, Asia/Manila time). Nobody presses a button for it.
// Completed also happens by itself, when the technician submits the service report
// (POST /api/reports). This job only does the first of the two.
//
// `now` is a parameter so the rule can be tested with a fake clock. A booking whose
// block already passed (the server was down, or the job missed a run) is caught on the
// next run, so nothing stays stuck as Approved.
async function runBookingStatusCheck(now = new Date()) {
  const approved = await Booking.find({ status: BOOKING_STATUS.APPROVED }).select('bookingId date time');

  const dueIds = approved
    .filter((b) => b.date && blockStartInstant(b.date, b.time) <= now)
    .map((b) => b._id);

  if (dueIds.length === 0) return { matched: approved.length, modified: 0 };

  const result = await Booking.updateMany(
    { _id: { $in: dueIds }, status: BOOKING_STATUS.APPROVED },
    { $set: { status: BOOKING_STATUS.IN_PROGRESS } }
  );

  return { matched: approved.length, modified: result.modifiedCount ?? result.nModified ?? 0 };
}

async function safeRun() {
  try {
    await runBookingStatusCheck();
  } catch (err) {
    console.error('Booking status auto-transition check failed:', err);
  }
}

// Every 10 minutes, on Manila time, plus once right now so a server that was off
// catches up immediately instead of waiting for the next tick.
function startBookingStatusSchedule() {
  cron.schedule('*/10 * * * *', safeRun, { timezone: TIMEZONE });
  safeRun();
}

module.exports = { runBookingStatusCheck, startBookingStatusSchedule };
