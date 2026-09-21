const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Announcement = require('../models/Announcement');
const auth = require('../middleware/auth');

// ============================================
// PUBLIC ROUTE (no auth — Landing Page announcement board)
// ============================================
router.get('/public', async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ADMIN ROUTES (System Configuration Module)
// ============================================

// GET all announcements, active and inactive (admin management page)
router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { title, message, category, displayDate, isActive } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const announcement = await Announcement.create({
      _id: crypto.randomUUID(),
      title: title.trim(),
      message: message.trim(),
      category: category || 'General',
      displayDate: displayDate || '',
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json(announcement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { title, message, category, displayDate, isActive } = req.body;

    if (title !== undefined && !title.trim()) {
      return res.status(400).json({ message: 'Title cannot be empty' });
    }
    if (message !== undefined && !message.trim()) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }

    const update = {};
    if (title !== undefined) update.title = title.trim();
    if (message !== undefined) update.message = message.trim();
    if (category !== undefined) update.category = category;
    if (displayDate !== undefined) update.displayDate = displayDate;
    if (isActive !== undefined) update.isActive = isActive;

    const announcement = await Announcement.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    res.json(announcement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
