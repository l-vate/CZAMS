const mongoose = require('mongoose');

const backJobSchema = new mongoose.Schema({
    backJobId: { type: String, unique: true, required: true },

    // Reference to the original completed booking the issue is about
    originalBookingId: {
        type: String,
        required: true,
        ref: 'Booking'
    },
    originalBooking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },

    customer: { type: String, ref: 'User', required: true },

    issueDescription: {
        type: String,
        required: true,
        trim: true
    },

    // Snapshot of the Warranty Tracking Module's getWarrantyStatus() check at the
    // moment the claim was filed, so the free-vs-not-covered decision stays
    // auditable even if the underlying booking/warranty data changes later.
    warrantyCheck: {
        withinWarranty: Boolean,
        coverageType: String,
        checkedAt: Date,
    },

    // 'Scheduled': within warranty, a free resulting Booking was auto-created.
    // 'Not Covered': outside warranty — the paper doesn't specify what happens
    // next, so this just flags the claim for admin to decide manually.
    // 'Reviewed': admin has looked at a Not Covered claim and handled it outside the system.
    status: {
        type: String,
        enum: ['Scheduled', 'Not Covered', 'Reviewed'],
        required: true,
    },

    // Only set when status is 'Scheduled' — the free follow-up repair visit.
    resultingBooking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },
    resultingBookingId: { type: String, default: null },

    reportedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: String,
}, {
    timestamps: true
});

backJobSchema.index({ originalBookingId: 1 });
backJobSchema.index({ customer: 1 });
backJobSchema.index({ status: 1 });

module.exports = mongoose.model('BackJob', backJobSchema);
