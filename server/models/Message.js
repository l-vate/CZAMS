const { ROLE_VALUES } = require('../constants/roles');
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: String, required: true, ref: 'User' },
  senderRole: { type: String, enum: ROLE_VALUES, required: true },
  text: { type: String, required: true, trim: true },
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
