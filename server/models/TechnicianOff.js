const mongoose = require('mongoose');

// A technician the admin marked as not available on a date (leave, a day off, sick, training). One entry per technician and date;
// `blocks` says which time blocks (Morning, Afternoon or both). The date is a Manila "YYYY-MM-DD" string like Booking.date. While an
// entry stands that technician counts as busy in those blocks everywhere: the public calendar, booking and reschedule checks, the
// assignment panel and the auto-assign proposals.
const technicianOffSchema = new mongoose.Schema({
  technician: { type: String, required: true, ref: 'User' },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  blocks: { type: [String], enum: ['Morning', 'Afternoon'], required: true, validate: (v) => v.length > 0 },
  reason: { type: String, default: '', maxlength: 200 },
  createdBy: String,
}, { timestamps: true, collection: 'technician_off' });

technicianOffSchema.index({ technician: 1, date: 1 }, { unique: true });
technicianOffSchema.index({ date: 1 });

module.exports = mongoose.model('TechnicianOff', technicianOffSchema);
