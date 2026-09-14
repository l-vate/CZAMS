// Notification Sender — the single place any module creates a notification for a
// user. Right now this only writes to the in-app Notification store: this codebase
// has no mailer configured (no nodemailer/SMTP credentials) and no SMS provider, so
// neither is faked here. If email gets configured later, that delivery step plugs
// in here rather than requiring every call site to be touched again.
const Notification = require('../models/Notification');

// options: { booking } — the full Booking document, optional, for context linking.
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

module.exports = { sendNotification };
