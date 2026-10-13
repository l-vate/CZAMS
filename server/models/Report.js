const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    // Reference to the booking
    bookingId: { 
        type: String, 
        required: true,
        ref: 'Booking'
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    
    // Technician who submitted the report - use String since User._id is String
    technicianId: {
        type: String,  // Changed from ObjectId to String
        required: true,
        ref: 'User'
    },
    
    // Report content
    workSummary: {
        type: String,
        required: true,
        trim: true
    },
    partsUsed: {
        type: String,
        trim: true
    },
    recommendations: {
        type: String,
        trim: true
    },
    laborHours: {
        type: Number,
        min: 0,
        max: 24
    },
    issueResolution: {
        type: String,
        enum: ['Complete', 'Partial', 'Unresolved'],
        default: 'Partial'
    },
    followUpRequired: {
        type: Boolean,
        default: false
    },
    followUpDate: {
        type: Date
    },
    notes: {
        type: String,
        trim: true
    },
    
    // System fields
    submittedAt: {
        type: Date,
        default: Date.now
    },
    submittedBy: {
        type: String,  // Changed from ObjectId to String
        ref: 'User'
    },
    
    // Additional metadata
    isFinal: {
        type: Boolean,
        default: true
    },

    // Service Report hardening: technician must flag a pre-existing issue at time of
    // service, not after — this is what lets Back Job Handling's admin review tell a
    // legitimate (workmanship-caused) claim apart from a pre-existing condition.
    preExistingIssue: {
        flagged: { type: Boolean, default: false },
        description: { type: String, trim: true },
    },

    // Client consent + e-signature, required to finalize the report. Captured on the
    // technician's device at time of service (the client signs in person before the
    // technician leaves), not a remote/async approval step.
    clientConsent: {
        signedName: { type: String, trim: true },
        signatureDataUrl: String,
        signedAt: Date,
    },
}, {
    timestamps: true
});

// Index for faster queries
reportSchema.index({ bookingId: 1 });
reportSchema.index({ technicianId: 1 });
reportSchema.index({ submittedAt: -1 });

// Virtual to get booking details
reportSchema.virtual('bookingDetails', {
    ref: 'Booking',
    localField: 'booking',
    foreignField: '_id',
    justOne: true
});

module.exports = mongoose.model('Report', reportSchema);