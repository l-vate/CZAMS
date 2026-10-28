const { ROLE_VALUES } = require('../constants/roles');
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: String, required: true, ref: 'User' },
  senderRole: { type: String, enum: ROLE_VALUES, required: true },
  text: { type: String, required: true, trim: true },
  // The booking a customer was writing about (from "Contact owner"): a snapshot for the card shown with the message.
  bookingRef: {
    type: new mongoose.Schema({
      bookingId: String, service: String, items: String, total: Number, status: String, when: String, placed: String,
    }, { _id: false }),
    default: undefined,
  },
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
