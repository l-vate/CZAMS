const { BOOKING_STATUS } = require('../constants/bookingStatus');
const cron = require('node-cron');
const Booking = require('../models/Booking');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { sendNotification } = require('../utils/notifications');
const { blockStartInstant, TIMEZONE } = require('../utils/timeBlocks');

// Approved -> In Progress happens by itself when the booking's time block starts
// (Morning 08:00, Afternoon 13:00, Asia/Manila time). Nobody presses a button for it.
// Completed also happens by itself, when the technician submits the service report
// (POST /api/reports). This job only does the first of the two, and tells the customer once for each booking it moves.
//
// `now` is a parameter so the rule can be tested with a fake clock. A booking whose
// block already passed (the server was down, or the job missed a run) is caught on the
// next run, so nothing stays stuck as Approved.
async function runBookingStatusCheck(now = new Date()) {
  const approved = await Booking.find({ status: BOOKING_STATUS.APPROVED }).select('bookingId date time customer service').populate('service', 'name');

  const due = approved.filter((b) => b.date && blockStartInstant(b.date, b.time) <= now);
  if (due.length === 0) return { matched: approved.length, modified: 0 };

  // One conditional update per booking, so only a booking this run really moved is announced (a second run or an admin
  // cancelling at the same moment cannot cause a second or a wrong notice). A notification problem is only logged.
  let modified = 0;
  for (const booking of due) {
    const moved = await Booking.findOneAndUpdate(
      { _id: booking._id, status: BOOKING_STATUS.APPROVED },
      { $set: { status: BOOKING_STATUS.IN_PROGRESS } },
      { returnDocument: 'after' }
    );
    if (!moved) continue;
    modified += 1;
    try {
      await sendNotification(
        booking.customer,
        NOTIFICATION_TYPE.BOOKING_IN_PROGRESS,
        `Your service for booking ${booking.bookingId} (${booking.service?.name || 'your service'}) is now in progress.`,
        { booking: moved }
      );
    } catch (err) {
      console.error(`Could not notify the customer that booking ${booking.bookingId} is in progress:`, err.message);
    }
  }

  return { matched: approved.length, modified };
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
