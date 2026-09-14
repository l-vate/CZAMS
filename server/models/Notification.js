const mongoose = require('mongoose');

// In-app notification store (Notification Sender). `type` is a free label rather
// than a strict enum — new callers (Service Disruption & Extension, etc.) can send
// a new kind of notification without a schema change.
const notificationSchema = new mongoose.Schema({
    user: { type: String, ref: 'User', required: true }, // recipient
    type: { type: String, required: true },
    message: { type: String, required: true },

    // Optional context link back to whatever this notification is about.
    relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    relatedBookingId: { type: String, default: null },

    read: { type: Boolean, default: false },
    readAt: Date,
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
