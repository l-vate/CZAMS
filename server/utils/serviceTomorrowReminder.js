// The "Your service is tomorrow" reminder. For every Approved booking whose booked day is tomorrow (Asia/Manila), the customer gets an in-app
// notification and an email through the shared template, and each assigned technician gets an in-app note (no email). It is a reminder only:
// it never changes a booking's status, never touches a payment or a refund, and never creates or cancels a booking. The one thing it writes
// on a booking is `serviceReminderSentFor`, the date it reminded about, which is also what keeps it to one reminder per booked date: the claim
// is a conditional update, so two runs at once (or two server instances) cannot send twice. A reschedule is a new date, so it is reminded
// again for that date. `now` is a parameter so the rules are tested with a fixed clock; the log line says counts only.
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const User = require('../models/User');
require('../models/Service'); // registers the model the booking's service is read through
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const settings = require('../constants/serviceTomorrowReminder');
const { sendNotification } = require('./notifications');
const { getMemberIds } = require('./assignments');
const { paymentDueOf } = require('./paymentDue');
const { manilaToday, addDaysManila } = require('./manilaDate');
const { BLOCKS } = require('./timeBlocks');

const MANILA_OFFSET_HOURS = 8;

// The hour of day (0 to 23) in Manila.
const manilaHour = (now) => new Date(now.getTime() + MANILA_OFFSET_HOURS * 3600000).getUTCHours();

// "8:00 AM" from an hour number.
const clock = (hour) => `${((hour + 11) % 12) + 1}:00 ${hour < 12 ? 'AM' : 'PM'}`;

// "Morning (8:00 AM to 12:00 PM)"; a block the config does not know is shown as written.
function blockText(time) {
  const block = BLOCKS[time];
  return block ? `${time} (${clock(block.startHour)} to ${clock(block.endHour)})` : String(time || '');
}

// "Thursday, November 5, 2026" from a YYYY-MM-DD key, read as written (no time zone shift).
function longDate(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const peso = (amount) => `₱${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The sentence for the customer. No amount unless something is already due.
function customerMessage(booking, technicianNames) {
  const service = (booking.service && booking.service.name) || 'Your service';
  const parts = [
    `Your service is tomorrow. ${service} is booked for ${longDate(booking.date)}, ${blockText(booking.time)}, at ${booking.address}.`,
  ];
  if (technicianNames.length > 0) parts.push(`Our technicians: ${technicianNames.join(', ')}.`);
  parts.push('Please make sure someone can let them in. If you need to change anything, open your booking.');
  const due = paymentDueOf(booking);
  if (due.kind) parts.push(`${due.kind === 'balance' ? 'Your balance' : 'Your down payment'} of ${peso(due.amount)} is due.`);
  return parts.join(' ');
}

function technicianMessage(booking) {
  const service = (booking.service && booking.service.name) || 'Service';
  return `Job tomorrow: ${service}, ${longDate(booking.date)}, ${blockText(booking.time)}, at ${booking.address}.`;
}

// A booking the owner asked us never to remind: a no-show report on it (any outcome) means the visit did not go as planned.
const NO_SHOW_FREE = { $or: [{ 'noShow.status': 'None' }, { 'noShow.status': { $exists: false } }, { noShow: { $exists: false } }] };

async function remindOne(booking, tomorrow, now) {
  // claim first: only the run that flips the stored date sends, and only while the booking is still Approved for that date
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: BOOKING_STATUS.APPROVED, date: tomorrow, serviceReminderSentFor: { $ne: tomorrow } },
    { $set: { serviceReminderSentFor: tomorrow, serviceReminderSentAt: now } },
    { returnDocument: 'after' }
  );
  if (!claimed) return null;

  const memberIds = getMemberIds(claimed);
  const result = { customer: false, technicians: 0 };
  try {
    await claimed.populate('service', 'name');
    const members = memberIds.length > 0 ? await User.find({ _id: { $in: memberIds } }).select('name') : [];
    const names = memberIds.map((id) => members.find((m) => String(m._id) === String(id))).filter(Boolean).map((m) => m.name);

    const customer = claimed.customer ? await User.findById(claimed.customer).select('_id') : null;
    if (customer) {
      await sendNotification(customer._id, NOTIFICATION_TYPE.BOOKING_TOMORROW_REMINDER, customerMessage(claimed, names), { booking: claimed });
      result.customer = true;
    }
    // an in-app note only (Notification.create, not sendNotification, so nothing is queued for email)
    await Promise.all(memberIds.map((id) => Notification.create({
      user: id,
      type: NOTIFICATION_TYPE.JOB_TOMORROW_REMINDER,
      message: technicianMessage(claimed),
      relatedBooking: claimed._id,
      relatedBookingId: claimed.bookingId,
    })));
    result.technicians = memberIds.length;
  } catch (err) {
    // nothing was sent for sure: give the claim back so the next run tries again
    await Booking.updateOne({ _id: claimed._id, serviceReminderSentFor: tomorrow }, { $set: { serviceReminderSentFor: null } });
    throw err;
  }
  return result;
}

// Adds one booking's outcome (null when another run had already claimed it) to the run's counts.
function addCounts(result, sent) {
  if (!sent) return;
  result.reminded += 1;
  result.customersNotified += sent.customer ? 1 : 0;
  result.techniciansNotified += sent.technicians;
}

// One page of bookings: each is claimed and reminded on its own, so one failure never stops the others.
async function remindPage(page, tomorrow, now, result) {
  for (const { _id } of page) {
    try {
      addCounts(result, await remindOne({ _id }, tomorrow, now));
    } catch (err) {
      result.failed += 1;
      console.error('Could not send a service tomorrow reminder:', err.message);
    }
  }
}

// One run. Returns counts only. `enabled` and `hour` default to the settings file so a test can pass its own.
async function runServiceTomorrowReminders({
  now = new Date(),
  dryRun = false,
  enabled = settings.SERVICE_TOMORROW_REMINDER_ENABLED,
  hour = settings.SERVICE_TOMORROW_REMINDER_HOUR,
  batch = settings.SERVICE_TOMORROW_REMINDER_BATCH,
} = {}) {
  const result = { dryRun, enabled, matched: 0, reminded: 0, customersNotified: 0, techniciansNotified: 0, failed: 0 };
  if (!enabled) return result;
  // from the reminder hour on the day before; the query below only finds tomorrow's bookings, so the service day itself never gets one
  if (manilaHour(now) < hour) return result;

  const tomorrow = addDaysManila(manilaToday(now), 1);
  const filter = {
    status: BOOKING_STATUS.APPROVED,
    date: tomorrow,
    serviceReminderSentFor: { $ne: tomorrow },
    expiredBySystem: { $ne: true },
    ...NO_SHOW_FREE,
  };

  let lastId = null;
  for (;;) {
    const page = await Booking.find(lastId ? { ...filter, _id: { $gt: lastId } } : filter).sort({ _id: 1 }).limit(batch).select('_id');
    if (page.length === 0) break;
    lastId = page[page.length - 1]._id;
    result.matched += page.length;
    if (!dryRun) await remindPage(page, tomorrow, now, result);
    if (page.length < batch) break;
  }
  return result;
}

module.exports = { runServiceTomorrowReminders, customerMessage, technicianMessage, blockText, longDate, manilaHour };
