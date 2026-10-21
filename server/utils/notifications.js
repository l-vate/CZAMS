// Notification Sender - the single place any module creates a notification for a
// user. Selected notifications are also queued for email when SMTP is configured;
// the queue worker handles delivery separately so mail failures do not block callers.
const { ROLE } = require('../constants/roles');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { queueNotificationEmail } = require('./emailDelivery');

// options: { booking } - the full Booking document, optional, for context linking.
async function sendNotification(userId, type, message, options = {}) {
  const { booking } = options;

  const notification = await Notification.create({
    user: userId,
    type,
    message,
    relatedBooking: booking?._id || null,
    relatedBookingId: booking?.bookingId || null,
  });

  try {
    await queueNotificationEmail(userId, type, message, notification._id);
  } catch (err) {
    console.error('Email notification enqueue failed:', err.message);
  }

  return notification;
}

// Same notification to every active admin account. A failure here must never fail
// the request that triggered it (the booking action already succeeded), so errors
// are logged and swallowed.
async function notifyAdmins(type, message, options = {}) {
  try {
    const admins = await User.find({ role: ROLE.ADMIN, isActive: { $ne: false } }).select('_id');
    await Promise.all(admins.map((a) => sendNotification(a._id, type, message, options)));
  } catch (err) {
    console.error('notifyAdmins failed:', err.message);
  }
}

module.exports = { sendNotification, notifyAdmins };
