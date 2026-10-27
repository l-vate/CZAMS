// The "Email notification" card on a booking: GET /api/bookings/:bookingId/email-status. It shows the most recent email about that booking
// for the person looking: a customer for their own booking, a technician for a booking they are on, an admin for any booking (the email that
// went to the booking's customer). It never returns the full address, the subject or the body, and an error text never leaves the server.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { ROLE } = require('../middleware/roles');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Notification = require('../models/Notification');
const EmailDelivery = require('../models/EmailDelivery');
const { memberFilter } = require('../utils/assignments');
const { smtpConfig } = require('../utils/emailDelivery');
const { emailCard } = require('../utils/emailStatus');
const { sendRouteError } = require('../utils/routeErrors');

router.get('/:bookingId/email-status', auth, async (req, res) => {
  try {
    const admin = req.userRole === ROLE.ADMIN;
    let booking = null;
    if (admin) booking = await Booking.findOne({ bookingId: req.params.bookingId }).select('bookingId customer');
    else if (req.userRole === ROLE.CUSTOMER) booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId }).select('bookingId customer');
    else booking = await Booking.findOne({ bookingId: req.params.bookingId, ...memberFilter([req.userId]) }).select('bookingId customer');
    // another person's booking looks exactly like a booking that does not exist
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // whose email: the viewer's own, except that an admin looks at what went to the booking's customer
    const recipientId = admin ? booking.customer : req.userId;
    const recipient = await User.findById(recipientId).select('email');
    const hasEmail = Boolean(recipient && recipient.email);
    const configured = smtpConfig() !== null;

    let delivery = null;
    if (hasEmail) {
      const notes = await Notification.find({ relatedBookingId: booking.bookingId, user: String(recipientId) }).select('_id');
      if (notes.length > 0) {
        const rows = await EmailDelivery.find({ notification: { $in: notes.map((n) => n._id) } })
          .sort({ createdAt: -1 }).limit(1).select('status sentAt createdAt recipientEmail attempts lastError');
        delivery = rows[0] || null;
      }
    }
    res.json({ ...emailCard({ delivery, configured, hasEmail, admin }), ...(admin ? { configured } : {}) });
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;
