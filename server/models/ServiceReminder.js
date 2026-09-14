const mongoose = require('mongoose');

// Service Reminder Module. This is the hook point for #8 (real notification
// sending): the "who's due" job (server/jobs/serviceReminderJob.js) only ever
// creates these records — it never sends anything itself. When real sending is
// built, it should query status: 'Pending Notification', send, then flip the
// status here, rather than touching the detection logic in the job.
const serviceReminderSchema = new mongoose.Schema({
    customer: { type: String, ref: 'User', required: true },

    // The completed Cleaning booking this reminder is based on — a back-job repair
    // visit is never this booking, since it doesn't reset the reminder clock.
    lastCleaningBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    lastCleaningBookingId: { type: String, required: true },
    lastCleaningDate: { type: Date, required: true },

    dueAt: { type: Date, required: true }, // lastCleaningDate + the trigger interval, for reference

    status: {
        type: String,
        enum: ['Pending Notification', 'Notified'],
        default: 'Pending Notification',
    },
    notifiedAt: Date,

    triggeredAt: { type: Date, default: Date.now },
}, { timestamps: true });

// One reminder per (customer, last cleaning) pair — the job checks this before
// creating a new one, so a customer already flagged due doesn't get duplicate
// records every time the scheduled check runs.
serviceReminderSchema.index({ customer: 1, lastCleaningBooking: 1 }, { unique: true });
serviceReminderSchema.index({ status: 1 });

module.exports = mongoose.model('ServiceReminder', serviceReminderSchema);
