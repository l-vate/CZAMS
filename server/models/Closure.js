const mongoose = require('mongoose');

// A date the shop is closed (a holiday, an event). The date is a Manila "YYYY-MM-DD" string like
// Booking.date, and there is at most one closure per date. Sunday is handled elsewhere and is not
// stored here.
const closureSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  reason: { type: String, required: true, minlength: 3, maxlength: 200 },
  createdBy: String,
}, { timestamps: true, collection: 'closures' });

module.exports = mongoose.model('Closure', closureSchema);
