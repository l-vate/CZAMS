const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { ROLE } = require('../constants/roles');
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { sendNotification, notifyAdmins } = require('../utils/notifications');

// ============================================
// PARTICIPANT SIDE (customer / staff) - always operates on "their" conversation,
// created lazily on first message rather than the moment they open the chat tab.
// ============================================

router.get('/conversations/mine', auth, async (req, res) => {
  try {
    if (req.userRole === ROLE.ADMIN) {
      return res.status(400).json({ message: 'Admin has no single conversation - use /conversations' });
    }
    const conversation = await Conversation.findOne({ participantId: req.userId });
    res.json(conversation || null);
  } catch (err) {
    console.error('Error fetching own conversation:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/conversations/mine/messages', auth, async (req, res) => {
  try {
    if (req.userRole === ROLE.ADMIN) {
      return res.status(400).json({ message: 'Admin has no single conversation - use /conversations/:id/messages' });
    }
    const conversation = await Conversation.findOne({ participantId: req.userId });
    if (!conversation) return res.json([]);
    const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    console.error('Error fetching own messages:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/conversations/mine/messages', auth, async (req, res) => {
  try {
    if (req.userRole === ROLE.ADMIN) {
      return res.status(400).json({ message: 'Admin has no single conversation - use /conversations/:id/messages' });
    }
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    let conversation = await Conversation.findOne({ participantId: req.userId });
    if (!conversation) {
      conversation = await Conversation.create({
        participantId: req.userId,
        participantRole: req.userRole,
      });
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: req.userId,
      senderRole: req.userRole,
      text: text.trim(),
    });

    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessageText = message.text;
    conversation.lastMessageBySenderRole = req.userRole;
    await conversation.save();

    // Every active admin is told, once each, and a notification problem never fails the message.
    await notifyAdmins(NOTIFICATION_TYPE.CHAT_MESSAGE, `New message from ${req.userRole === ROLE.STAFF ? 'a technician' : 'a customer'}: "${message.text.slice(0, 80)}"`);

    res.status(201).json(message);
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ADMIN SIDE - inbox across every conversation, plus the shared :id endpoints
// (also reachable by the owning participant, for a single code path either side
// of the shared chat component can use if it already has a conversation id).
// ============================================

router.get('/conversations', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const conversations = await Conversation.find().sort({ lastMessageAt: -1 });
    const withParticipants = await Promise.all(conversations.map(async (c) => {
      const obj = c.toObject();
      const participant = await User.findById(c.participantId).select('name email');
      obj.participant = participant;
      obj.unread = !!(c.lastMessageBySenderRole && c.lastMessageBySenderRole !== ROLE.ADMIN &&
        (!c.adminReadAt || c.lastMessageAt > c.adminReadAt));
      return obj;
    }));
    res.json(withParticipants);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

async function assertConversationAccess(req, res) {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) {
    res.status(404).json({ message: 'Conversation not found' });
    return null;
  }
  if (req.userRole !== ROLE.ADMIN && conversation.participantId !== req.userId) {
    res.status(403).json({ message: 'Forbidden' });
    return null;
  }
  return conversation;
}

router.get('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const conversation = await assertConversationAccess(req, res);
    if (!conversation) return;

    if (req.userRole === ROLE.ADMIN) {
      conversation.adminReadAt = new Date();
      await conversation.save();
    }

    const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const conversation = await assertConversationAccess(req, res);
    if (!conversation) return;

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: req.userId,
      senderRole: req.userRole,
      text: text.trim(),
    });

    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessageText = message.text;
    conversation.lastMessageBySenderRole = req.userRole;
    if (req.userRole === ROLE.ADMIN) {
      conversation.adminReadAt = message.createdAt;
      await sendNotification(conversation.participantId, NOTIFICATION_TYPE.CHAT_MESSAGE, `New message from Admin Support: "${message.text.slice(0, 80)}"`);
    }
    await conversation.save();

    res.status(201).json(message);
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
