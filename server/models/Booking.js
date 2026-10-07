const { REFUND_STATUS_VALUES, REFUND_STATUS } = require('../constants/refundStatus');
const { PAYMENT_STATUS_VALUES, PAYMENT_STATUS, BALANCE_PAYMENT_STATUS_VALUES, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const { BOOKING_STATUS, BOOKING_STATUS_VALUES } = require('../constants/bookingStatus');
const mongoose = require('mongoose');

// Senior Citizen / PWD discount. Optional, requested at booking time with a photo of a
// valid ID and NOT applied until an admin approves it (walk-in bookings made by an
// admin are approved on the spot). Declared as its own schema because a nested
// object with a key named "type" would otherwise be read by Mongoose as a type
// declaration.
const discountSchema = new mongoose.Schema({
    type: { type: String, enum: ['Senior', 'PWD', null], default: null },
    idFile: String,
    status: { type: String, enum: ['None', 'Pending', 'Approved', 'Rejected'], default: 'None' },
    // Rate frozen at approval time (from PaymentSettings.seniorPwdDiscountPercent), so a
    // later settings change never rewrites an already approved booking.
    percent: Number,
    // Snapshot of the discount in pesos at approval time. The live total is always
    // recomputed from `percent` (see utils/pricing.js), the same way every other
    // price follows the current service price.
    amount: Number,
    // Down payment already verified as paid when the discount was approved, if any.
    // Used so the balance reflects what the customer really paid, never auto-refunded.
    dpPaidBeforeApproval: Number,
    rejectionReason: String,
    requestedAt: Date,
    reviewedAt: Date,
}, { _id: false });

const bookingSchema = new mongoose.Schema({
    bookingId: { type: String, unique: true, required: true },
    customer: { type: String, ref: 'User', required: true },
    service: { type: String, ref: 'Service', required: true },

    // Multi-Unit Booking Redesign: a customer can now list one or more unit
    // entries, each with its own type, quantity, and brand/model - replacing the
    // old single-type-per-booking model where unitTypes was just a flat list of
    // type names with no quantity and one bulk brandModel text field for
    // everything. `unitTypes`/`brandModel` below are kept (not removed) purely
    // for backward-reading bookings created before this change - Mongoose only
    // exposes schema-declared paths, so dropping them would make historical
    // bookings' unit info disappear from admin views/reports, not just look
    // different. New bookings only ever populate `units`.
    units: [{
      type: { type: String, required: true },
      quantity: { type: Number, required: true, min: 1, default: 1 },
      brandModel: String,
    }],
    // Legacy: kept for existing data
    unitTypes: [String],
    // Legacy: kept for existing data
    brandModel: String,
    problemDescription: String,
    // Admin-authored, pre-service - care requirements, access instructions,
    // client-specific handling. Separate from problemDescription (the customer's
    // own account of the issue) - this is admin briefing the technician.
    technicianInstructions: String,
    date: String,
    time: String,
    // The primary lead of the first assigned team. Kept in step with `assignments` so every
    // older screen, report, feedback and analytics path that reads one technician keeps
    // working. A booking that only has `technician` (made before teams existed) is read as
    // a solo assignment, see utils/assignments.js: stored data is not rewritten.
    technician: { type: String, ref: 'User' },
    // Position in the admin's Pending queue (lower = earlier). Handed out in the order bookings
    // arrive (first come, first served) and rewritten when the admin reorders. Admin only, so it
    // is not selected unless asked for: customers never receive it.
    queueRank: { type: Number, select: false },
    // Who actually does the job: one entry per assigned team (more than one for a big job).
    // lead and helper ids are copied from the team so history survives team edits. A solo
    // technician (allowed only for check-up or survey visits) has team null and no helper.
    assignments: [{
      team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
      lead: { type: String, ref: 'User', required: true },
      helper: { type: String, ref: 'User', default: null },
      _id: false,
    }],
    // The technician the customer asked for when booking. A preference only: it assigns
    // nobody and blocks nobody. Auto-assign uses it as a tie-breaker.
    requestedTechnician: { type: String, ref: 'User' },
    address: { type: String, required: true },
    // Who the technician should call. Required when a booking is created (see the
    // create route) but deliberately not `required` in the schema: bookings made
    // before this field existed have none and must stay saveable; readers fall back
    // to the customer's profile phone.
    contactNumber: String,
    downPaymentPercent: Number,
    paymentMode: String,
    paymentMode2: String,

    paymentStatus: { 
        type: String, 
        enum: PAYMENT_STATUS_VALUES,
        default: PAYMENT_STATUS.UNPAID
    },
    
    balancePaid: { type: Boolean, default: false },
    balancePaymentStatus: { 
        type: String, 
        enum: BALANCE_PAYMENT_STATUS_VALUES,
        default: BALANCE_PAYMENT_STATUS.NONE
    },
    
    proofFile: String,
    balanceProofFile: String,
    
    status: {
        type: String,
        enum: BOOKING_STATUS_VALUES,
        default: BOOKING_STATUS.PENDING,
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
    
    // Legacy: kept for existing data (new reports live in the Report collection)
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
    // had a down payment on file at cancellation time (see /:bookingId/cancel) - a
    // cleaning booking with no down payment simply stays 'None'.
    refund: {
        status: { type: String, enum: REFUND_STATUS_VALUES, default: REFUND_STATUS.NONE },
        isSameDay: { type: Boolean, default: false },
        downPaymentAmount: Number,
        dispatchDeduction: Number,
        refundableAmount: Number,
        requestedAt: Date,
        processedAt: Date,
        processedBy: String,
        // Proof the money was actually sent back - required before status can become
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
    // Analytics - not touched on later edits so it stays a true first-approval time.
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
    // false, i.e. a CZA-supplied unit) - backs a future 5yr/1yr Unit Warranty claim
    // the same way unitWaiver backs a client-supplied-unit exclusion. Same
    // uploads/proofs storage and admin-facing pattern as payment proof; uploaded by
    // admin once the unit purchase is confirmed, not by the customer at booking time.
    unitPurchaseProof: String,

    // Distance/Mobilization Charges: admin-entered, not system-computed - CZA has
    // no full price-by-zone table to auto-derive this from. distanceAdjustment is
    // for Cleaning jobs; mobilizationFee is the (typically ~₱2,500 but
    // admin-adjustable per job) vehicle mobilization/demobilization charge for a
    // far Installation. Both default 0 (no charge) and are folded into the cost
    // breakdown as extra line items - see getBookingLineItems in
    // src/utils/bookingPricing.js and server/utils/pricing.js.
    distanceAdjustment: { type: Number, default: 0 },
    mobilizationFee: { type: Number, default: 0 },

    // Explicit Service Area Boundary: computed at booking creation from a
    // keyword match against the confirmed area list (Quezon City, Pasig, Manila,
    // Cavite, Alabang, GMA, Carmona) - see isWithinServiceArea in
    // server/utils/serviceArea.js. A miss doesn't block submission (free-text
    // address matching is too unreliable to hard-block real customers on), it
    // flags the booking for admin review instead.
    serviceAreaCheck: {
        withinArea: { type: Boolean, default: true },
        checkedAt: Date,
        adminReviewed: { type: Boolean, default: false },
    },

    // Back Job Handling Module: this booking is a free warranty repair visit
    // spawned from a BackJob claim, not a regular paid service request - kept as
    // its own flag (rather than inferring from downPaymentPercent === 0) so it can
    // be tracked/reported on separately, per the paper's "distinct category" ask.
    isBackJob: { type: Boolean, default: false },
    backJobId: { type: String, default: null },

    // Service Disruption & Extension Module. Both are single-booking-scoped state,
    // not a separate collection - a disruption report resolves into an admin
    // reschedule + notification (no new booking spawned), and extensionRequest
    // mirrors the existing rescheduleRequest shape (technician requests, admin
    // approves/denies) rather than inventing a new request pattern.
    // Three-Tier Cleaning Structure: the customer's answers to the tier-
    // determination questions in Step1 (book_service.jsx), kept for admin/
    // technician context on *why* this booking resolved to Deep Cleaning or
    // Pull-down Deep Cleaning rather than regular Cleaning - the actual pricing
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

    // Commercial Client Procedures (walk-in booking only - snapshotted from the
    // customer's clientType at booking time, per BIR invoicing/PO/terms client
    // requirements, rather than read live off the User doc, so a later account
    // edit never rewrites an already-issued invoice's numbers).
    discount: { type: discountSchema, default: () => ({}) },

    // The promotion this booking got, copied at creation so editing or deleting the promo later
    // never changes it. Its pesos amount is recomputed from the frozen type and value, the same
    // way every other price follows the current service price. A promo and a Senior/PWD discount
    // do not stack: whichever takes off more is the one applied (utils/pricing.js).
    promo: {
      promoId: { type: String, default: null },
      name: String,
      discountType: { type: String, enum: ['percent', 'fixed'] },
      discountValue: Number,
      amount: Number,
      _id: false,
    },

    isCommercial: { type: Boolean, default: false },
    // 12% VAT computed on the base price at booking time, additive on top of it -
    // does not change the down-payment/balance math, which still runs off the
    // VAT-exclusive base price the same as a residential booking.
    vatAmount: { type: Number, default: 0 },
    // PO-based ordering: optional reference number a commercial client's purchase
    // order carries, printed on the invoice. No format is enforced - POs are
    // whatever the client's own procurement system issues.
    poNumber: { type: String, default: null },
    // Payment terms (7-10 days after completion) in place of a down payment -
    // reuses the existing 0%-down-payment path (downPaymentPercent: 0), so
    // nothing about paymentStatus/proof handling changes; this just records how
    // many days after completion payment is due, and the concrete date once
    // completedAt is known.
    paymentTermsDays: { type: Number, default: null },
    paymentDueAt: { type: Date, default: null },
}, { timestamps: true });

// Add index for efficient queries
// REMOVED: bookingSchema.index({ bookingId: 1 }); // <-- This is the duplicate!
// Keep only these additional indexes
bookingSchema.index({ technician: 1, status: 1 });
bookingSchema.index({ status: 1, queueRank: 1 });
bookingSchema.index({ customer: 1 });

module.exports = mongoose.model('Booking', bookingSchema);