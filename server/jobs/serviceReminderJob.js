const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const cron = require('node-cron');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const ServiceReminder = require('../models/ServiceReminder');
const { sendNotification } = require('../utils/notifications');
const { effectiveCompletedAt } = require('../utils/completion');
const { manilaDateKey, monthsAgoManilaKey } = require('../utils/manilaDate');
const { addMonths } = require('../utils/warranty');
const { TIMEZONE } = require('../utils/timeBlocks');

// "3-4 months since the last cleaning" - a range, not an exact number. This uses
// the sooner end as the trigger point (a customer becomes due once 3 months have
// passed), matching how Back Job Handling used the sooner end of its own "2-3 days"
// range. Named constant so this is a one-line change if the client confirms differently.
const SERVICE_REMINDER_TRIGGER_MONTHS = 3;

// The "who's due" check. Finds each customer's most recent completed Cleaning
// booking (preventive maintenance only - check-ups stay client-initiated, per
// scope) and, if it's old enough, records that a reminder is due - but does not
// send anything itself. See deliverPendingServiceReminders() below for the
// delivery step, kept separate so detection never has to change to swap how
// (or whether) delivery happens.
async function runServiceReminderCheck() {
  const cleaningServices = await Service.find({ serviceType: SERVICE_TYPE.CLEANING }).select('_id');
  const cleaningServiceIds = cleaningServices.map((s) => s._id);

  if (cleaningServiceIds.length === 0) {
    return { customersChecked: 0, remindersCreated: 0 };
  }

  // A back-job repair visit doesn't reset the reminder clock - it's a redo of a
  // cleaning already counted, not a new preventive service - so it's excluded here
  // the same way it's excluded from the Customer Classification count.
  const cleaningBookings = await Booking.find({
    service: { $in: cleaningServiceIds },
    status: BOOKING_STATUS.COMPLETED,
    isBackJob: { $ne: true },
  });
  // Newest first by the effective completion date, so bookings with no completedAt still count.
  cleaningBookings.sort((a, b) => effectiveCompletedAt(b) - effectiveCompletedAt(a));

  // Most recent qualifying cleaning per customer (bookings are already sorted
  // newest-first, so the first one seen per customer is their latest).
  const latestByCustomer = new Map();
  for (const booking of cleaningBookings) {
    if (!latestByCustomer.has(booking.customer)) {
      latestByCustomer.set(booking.customer, booking);
    }
  }

  // Due once the Manila day of the cleaning is three calendar months back or more, so the answer does not depend on
  // the server's time zone.
  const dueCutoffKey = monthsAgoManilaKey(SERVICE_REMINDER_TRIGGER_MONTHS);

  let remindersCreated = 0;
  for (const [customerId, booking] of latestByCustomer) {
    const completedAt = effectiveCompletedAt(booking);
    if (manilaDateKey(completedAt) > dueCutoffKey) continue; // not due yet

    // One reminder per (customer, last cleaning) - skip if this cycle already flagged.
    const alreadyFlagged = await ServiceReminder.findOne({
      customer: customerId,
      lastCleaningBooking: booking._id,
    });
    if (alreadyFlagged) continue;

    const dueAt = addMonths(completedAt, SERVICE_REMINDER_TRIGGER_MONTHS);

    await ServiceReminder.create({
      customer: customerId,
      lastCleaningBooking: booking._id,
      lastCleaningBookingId: booking.bookingId,
      lastCleaningDate: completedAt,
      dueAt,
      status: 'Pending Notification',
    });
    remindersCreated += 1;
  }

  return { customersChecked: latestByCustomer.size, remindersCreated };
}

// Delivers any reminder still sitting at 'Pending Notification' - the exact hook
// point the detection step above was built to leave open. Uses the generic
// Notification Sender rather than anything reminder-specific, so this is just one
// caller among others (Back Job Handling, Service Disruption & Extension, etc.).
async function deliverPendingServiceReminders() {
  const pending = await ServiceReminder.find({ status: 'Pending Notification' });

  let delivered = 0;
  for (const reminder of pending) {
    const lastCleaningDate = new Date(reminder.lastCleaningDate).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: TIMEZONE,
    });

    await sendNotification(
      reminder.customer,
      NOTIFICATION_TYPE.SERVICE_REMINDER,
      `It's been a while since your last aircon cleaning (${lastCleaningDate}). Book your next preventive maintenance to keep your unit running well.`,
      { booking: null }
    );

    reminder.status = 'Notified';
    reminder.notifiedAt = new Date();
    await reminder.save();
    delivered += 1;
  }

  return { delivered };
}

async function safeRunDaily() {
  try {
    await runServiceReminderCheck();
    await deliverPendingServiceReminders();
  } catch (err) {
    console.error('Service reminder check failed:', err);
  }
}

// Runs every day at midnight Manila time - plenty granular for a months-long interval - and once right now. The check works from the
// bookings and the reminders already recorded (one reminder per customer and last cleaning), so it can be run at any time and as often
// as needed: a server that was asleep or off at midnight catches up as soon as it starts, and a second run creates and sends nothing twice.
function startServiceReminderSchedule() {
  cron.schedule('0 0 * * *', safeRunDaily, { timezone: TIMEZONE });
  safeRunDaily();
}

module.exports = {
  runServiceReminderCheck,
  deliverPendingServiceReminders,
  startServiceReminderSchedule,
  SERVICE_REMINDER_TRIGGER_MONTHS,
};
