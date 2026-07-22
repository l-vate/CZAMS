const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    bookingId: { type: String, unique: true, required: true },
    customer: { type: String, ref: 'User', required: true },
    service: { type: String, ref: 'Service', required: true },
    unitTypes: [String],
    brandModel: String,
    problemDescription: String,
    date: String,
    time: String,
    technician: String,
    address: { type: String, required: true },
    downPaymentPercent: Number,
    paymentMode: String,
    paymentMode2: String,
    paymentStatus: { type: String, default: 'Unpaid' },
    balancePaid: { type: Boolean, default: false },
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
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);