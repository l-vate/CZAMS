const mongoose = require('mongoose');

const emailDeliverySchema = new mongoose.Schema({
  notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true, unique: true },
  recipientEmail: { type: String, required: true },
  subject: { type: String, required: true },
  text: { type: String, required: true },
  html: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed'],
    default: 'pending',
  },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  processingAt: Date,
  sentAt: Date,
  lastError: String,
}, { timestamps: true });

emailDeliverySchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

module.exports = mongoose.model('EmailDelivery', emailDeliverySchema);
