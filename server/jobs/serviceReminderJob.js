const cron = require('node-cron');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const ServiceReminder = require('../models/ServiceReminder');
const { sendNotification } = require('../utils/notifications');

// "3-4 months since the last cleaning" — a range, not an exact number. This uses
// the sooner end as the trigger point (a customer becomes due once 3 months have
// passed), matching how Back Job Handling used the sooner end of its own "2-3 days"
// range. Named constant so this is a one-line change if the client confirms differently.
const SERVICE_REMINDER_TRIGGER_MONTHS = 3;

// The "who's due" check. Finds each customer's most recent completed Cleaning
// booking (preventive maintenance only — check-ups stay client-initiated, per
// scope) and, if it's old enough, records that a reminder is due — but does not
// send anything itself. See deliverPendingServiceReminders() below for the
// delivery step, kept separate so detection never has to change to swap how
// (or whether) delivery happens.
async function runServiceReminderCheck() {
  const cleaningServices = await Service.find({ serviceType: 'Cleaning' }).select('_id');
  const cleaningServiceIds = cleaningServices.map((s) => s._id);

  if (cleaningServiceIds.length === 0) {
    return { customersChecked: 0, remindersCreated: 0 };
  }

  // A back-job repair visit doesn't reset the reminder clock — it's a redo of a
  // cleaning already counted, not a new preventive service — so it's excluded here
  // the same way it's excluded from the Customer Classification count.
  const cleaningBookings = await Booking.find({
    service: { $in: cleaningServiceIds },
    status: 'Completed',
    isBackJob: { $ne: true },
    completedAt: { $ne: null },
  }).sort({ completedAt: -1 });

  // Most recent qualifying cleaning per customer (bookings are already sorted
  // newest-first, so the first one seen per customer is their latest).
  const latestByCustomer = new Map();
  for (const booking of cleaningBookings) {
    if (!latestByCustomer.has(booking.customer)) {
      latestByCustomer.set(booking.customer, booking);
    }
  }

  const dueCutoff = new Date();
  dueCutoff.setMonth(dueCutoff.getMonth() - SERVICE_REMINDER_TRIGGER_MONTHS);

  let remindersCreated = 0;
  for (const [customerId, booking] of latestByCustomer) {
    if (booking.completedAt > dueCutoff) continue; // not due yet

    // One reminder per (customer, last cleaning) — skip if this cycle already flagged.
    const alreadyFlagged = await ServiceReminder.findOne({
      customer: customerId,
      lastCleaningBooking: booking._id,
    });
    if (alreadyFlagged) continue;

    const dueAt = new Date(booking.completedAt);
    dueAt.setMonth(dueAt.getMonth() + SERVICE_REMINDER_TRIGGER_MONTHS);

    await ServiceReminder.create({
      customer: customerId,
      lastCleaningBooking: booking._id,
      lastCleaningBookingId: booking.bookingId,
      lastCleaningDate: booking.completedAt,
      dueAt,
      status: 'Pending Notification',
    });
    remindersCreated += 1;
  }

  return { customersChecked: latestByCustomer.size, remindersCreated };
}

// Delivers any reminder still sitting at 'Pending Notification' — the exact hook
// point the detection step above was built to leave open. Uses the generic
// Notification Sender rather than anything reminder-specific, so this is just one
// caller among others (Back Job Handling, Service Disruption & Extension, etc.).
async function deliverPendingServiceReminders() {
  const pending = await ServiceReminder.find({ status: 'Pending Notification' });

  let delivered = 0;
  for (const reminder of pending) {
    const lastCleaningDate = new Date(reminder.lastCleaningDate).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    await sendNotification(
      reminder.customer,
      'service_reminder',
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

// Runs once a day — plenty granular for a months-long interval, no need for anything tighter.
function startServiceReminderSchedule() {
  cron.schedule('0 0 * * *', async () => {
    try {
      await runServiceReminderCheck();
      await deliverPendingServiceReminders();
    } catch (err) {
      console.error('Service reminder check failed:', err);
    }
  });
}

module.exports = {
  runServiceReminderCheck,
  deliverPendingServiceReminders,
  startServiceReminderSchedule,
  SERVICE_REMINDER_TRIGGER_MONTHS,
};
