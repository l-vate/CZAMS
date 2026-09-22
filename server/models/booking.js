const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    bookingId: { type: String, unique: true, required: true },
    customer: { type: String, ref: 'User', required: true },
    service: { type: String, ref: 'Service', required: true },

    // Multi-Unit Booking Redesign: a customer can now list one or more unit
    // entries, each with its own type, quantity, and brand/model — replacing the
    // old single-type-per-booking model where unitTypes was just a flat list of
    // type names with no quantity and one bulk brandModel text field for
    // everything. `unitTypes`/`brandModel` below are kept (not removed) purely
    // for backward-reading bookings created before this change — Mongoose only
    // exposes schema-declared paths, so dropping them would make historical
    // bookings' unit info disappear from admin views/reports, not just look
    // different. New bookings only ever populate `units`.
    units: [{
      type: { type: String, required: true },
      quantity: { type: Number, required: true, min: 1, default: 1 },
      brandModel: String,
    }],
    unitTypes: [String],
    brandModel: String,
    problemDescription: String,
    // Admin-authored, pre-service — care requirements, access instructions,
    // client-specific handling. Separate from problemDescription (the customer's
    // own account of the issue) — this is admin briefing the technician.
    technicianInstructions: String,
    date: String,
    time: String,
    technician: { type: String, ref: 'User' },
    address: { type: String, required: true },
    downPaymentPercent: Number,
    paymentMode: String,
    paymentMode2: String,

    paymentStatus: { 
        type: String, 
        enum: ['Unpaid', 'to_verify', 'partially_paid', 'fully_paid', 'rejected'], 
        default: 'Unpaid' 
    },
    
    balancePaid: { type: Boolean, default: false },
    balancePaymentStatus: { 
        type: String, 
        enum: ['None', 'to_verify', 'paid', 'rejected'], 
        default: 'None' 
    },
    
    proofFile: String,
    balanceProofFile: String,
    
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'],
        default: 'Pending',
    },
    rescheduleRequest: {
        requestedDate: String,
        requestedTime: String,
        status: { type: String, enum: ['None', 'Pending', 'Approved', 'Denied'], default: 'None' },
    },
    
    // Reference to report (separate collection)
    reportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report',
        default: null
    },
    reportSubmitted: {
        type: Boolean,
        default: false
    },
    
    // Deprecated: Keeping for backward compatibility, but will be moved to reports collection
    report: {
        workSummary: String,
        partsUsed: String,
        recommendations: String,
        submittedAt: Date,
        laborHours: Number,
        issueResolution: String,
        followUpRequired: Boolean,
        followUpDate: Date,
        notes: String,
        submittedBy: String,
    },
    
    feedback: {
        text: String,
        rating: Number,
        createdAt: Date,
    },

    // Down-payment refund on a cancelled booking. Only set when the booking actually
    // had a down payment on file at cancellation time (see /:bookingId/cancel) — a
    // cleaning booking with no down payment simply stays 'None'.
    refund: {
        status: { type: String, enum: ['None', 'Pending', 'Processed'], default: 'None' },
        isSameDay: { type: Boolean, default: false },
        downPaymentAmount: Number,
        dispatchDeduction: Number,
        refundableAmount: Number,
        requestedAt: Date,
        processedAt: Date,
        processedBy: String,
        // Proof the money was actually sent back — required before status can become
        // 'Processed'. Same uploads/proofs storage as customer proof-of-payment.
        proofFile: String,
        // A customer can flag a refund that hasn't come through (e.g. marked Processed
        // but never received). Single message + status, not a full ticketing thread.
        customerFlag: {
            flagged: { type: Boolean, default: false },
            message: String,
            flaggedAt: Date,
            resolved: { type: Boolean, default: false },
            resolvedAt: Date,
            resolvedBy: String,
        },
    },

    completedAt: Date,

    // Admin Dashboard + Analytics Module: set once, the first time status
    // transitions to 'Approved' (see admin-update in bookingRoutes.js). Backs the
    // "average response time" metric (approvedAt - createdAt) in Service Request
    // Analytics — not touched on later edits so it stays a true first-approval time.
    approvedAt: Date,

    // Warranty Tracking Module: only meaningful for Installation bookings. When the
    // client supplies their own unit, the Unit Warranty (compressor/parts) doesn't
    // apply, and a waiver acknowledging that is required and stored here.
    clientSuppliedUnit: { type: Boolean, default: false },
    unitWaiver: {
        acknowledged: Boolean,
        customerName: String,
        acknowledgedAt: Date,
    },

    // Proof of purchase through CZA (only applicable when clientSuppliedUnit is
    // false, i.e. a CZA-supplied unit) — backs a future 5yr/1yr Unit Warranty claim
    // the same way unitWaiver backs a client-supplied-unit exclusion. Same
    // uploads/proofs storage and admin-facing pattern as payment proof; uploaded by
    // admin once the unit purchase is confirmed, not by the customer at booking time.
    unitPurchaseProof: String,

    // Distance/Mobilization Charges: admin-entered, not system-computed — CZA has
    // no full price-by-zone table to auto-derive this from. distanceAdjustment is
    // for Cleaning jobs; mobilizationFee is the (typically ~₱2,500 but
    // admin-adjustable per job) vehicle mobilization/demobilization charge for a
    // far Installation. Both default 0 (no charge) and are folded into the cost
    // breakdown as extra line items — see getBookingLineItems in
    // src/utils/bookingPricing.js and server/utils/pricing.js.
    distanceAdjustment: { type: Number, default: 0 },
    mobilizationFee: { type: Number, default: 0 },

    // Explicit Service Area Boundary: computed at booking creation from a
    // keyword match against the confirmed area list (Quezon City, Pasig, Manila,
    // Cavite, Alabang, GMA, Carmona) — see isWithinServiceArea in
    // server/utils/serviceArea.js. A miss doesn't block submission (free-text
    // address matching is too unreliable to hard-block real customers on), it
    // flags the booking for admin review instead.
    serviceAreaCheck: {
        withinArea: { type: Boolean, default: true },
        checkedAt: Date,
        adminReviewed: { type: Boolean, default: false },
    },

    // Back Job Handling Module: this booking is a free warranty repair visit
    // spawned from a BackJob claim, not a regular paid service request — kept as
    // its own flag (rather than inferring from downPaymentPercent === 0) so it can
    // be tracked/reported on separately, per the paper's "distinct category" ask.
    isBackJob: { type: Boolean, default: false },
    backJobId: { type: String, default: null },

    // Service Disruption & Extension Module. Both are single-booking-scoped state,
    // not a separate collection — a disruption report resolves into an admin
    // reschedule + notification (no new booking spawned), and extensionRequest
    // mirrors the existing rescheduleRequest shape (technician requests, admin
    // approves/denies) rather than inventing a new request pattern.
    // Three-Tier Cleaning Structure: the customer's answers to the tier-
    // determination questions in Step1 (book_service.jsx), kept for admin/
    // technician context on *why* this booking resolved to Deep Cleaning or
    // Pull-down Deep Cleaning rather than regular Cleaning — the actual pricing
    // comes from which Service got selected, this is just the record of the inputs.
    cleaningTierAnswers: {
        lastCleanedOver6MonthsAgo: Boolean,
        isActivelyLeaking: Boolean,
    },

    disruption: {
        status: { type: String, enum: ['None', 'Reported', 'Rescheduled'], default: 'None' },
        reason: String,
        reportedAt: Date,
        reportedBy: String,
        rescheduledAt: Date,
    },
    extensionRequest: {
        status: { type: String, enum: ['None', 'Pending', 'Approved', 'Denied'], default: 'None' },
        reason: String,
        requestedAt: Date,
        requestedBy: String,
        decidedAt: Date,
        decidedBy: String,
    },
}, { timestamps: true });

// Add index for efficient queries
// REMOVED: bookingSchema.index({ bookingId: 1 }); // <-- This is the duplicate!
// Keep only these additional indexes
bookingSchema.index({ technician: 1, status: 1 });
bookingSchema.index({ customer: 1 });

module.exports = mongoose.model('Booking', bookingSchema);