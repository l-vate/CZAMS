// Notification Sender - the single place any module creates a notification for a
// user. Right now this only writes to the in-app Notification store: this codebase
// has no mailer configured (no nodemailer/SMTP credentials) and no SMS provider, so
// neither is faked here. If email gets configured later, that delivery step plugs
// in here rather than requiring every call site to be touched again.
const { ROLE } = require('../constants/roles');
const Notification = require('../models/Notification');
const User = require('../models/User');

// options: { booking } - the full Booking document, optional, for context linking.
async function sendNotification(userId, type, message, options = {}) {
  const { booking } = options;

  return Notification.create({
    user: userId,
    type,
    message,
    relatedBooking: booking?._id || null,
    relatedBookingId: booking?.bookingId || null,
  });
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
