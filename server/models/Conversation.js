const { ROLE_VALUES, ROLE } = require('../constants/roles');
const mongoose = require('mongoose');

// One thread per non-admin user - admin is implicit on every thread (this system
// has exactly one admin account). Shared by both customer<->admin and
// technician<->admin chat rather than two separate systems.
const conversationSchema = new mongoose.Schema({
  participantId: { type: String, required: true, ref: 'User', unique: true },
  participantRole: { type: String, enum: [ROLE.CUSTOMER, ROLE.STAFF], required: true },
  lastMessageAt: { type: Date, default: Date.now },
  lastMessageText: { type: String, default: '' },
  lastMessageBySenderRole: { type: String, enum: ROLE_VALUES, default: null },
  // Only tracked for the admin side, to power the inbox's unread indicator.
  // The old single read time, kept so threads read before this existed do not all show as unread.
  adminReadAt: { type: Date, default: null },
  // When each admin last opened this thread: admin id -> time. One admin opening a thread does not mark it read for the others.
  adminReadAtBy: { type: Map, of: Date, default: undefined },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);
