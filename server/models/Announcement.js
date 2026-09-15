const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  _id: { type: String },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  category: { type: String, enum: ['Holiday', 'Closure', 'Maintenance', 'General'], default: 'General' },

  // Optional human-readable date/date-range for the notice itself (e.g. "Dec 25,
  // 2026" or "Dec 24-26, 2026") — display-only, same convention as Booking.date
  // (stored as a String rather than parsed), not used for any scheduling logic.
  displayDate: String,

  // Lets admin take a notice down without deleting it (Landing Page Module — the
  // public route only returns isActive: true).
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'announcements' });

module.exports = mongoose.model('Announcement', announcementSchema);
