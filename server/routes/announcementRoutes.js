const { ROLE } = require('../constants/roles');
const auditSpecs = require('../utils/auditSpecs');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Announcement = require('../models/Announcement');
const auth = require('../middleware/auth');
const { announcementInputProblem } = require('../utils/adminInput');
const { sendProblem } = require('../utils/validation');
const { sendRouteError } = require('../utils/routeErrors');

// ============================================
// PUBLIC ROUTE (no auth - Landing Page announcement board)
// ============================================
router.get('/public', async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// ============================================
// ADMIN ROUTES (System Configuration Module)
// ============================================

// GET all announcements, active and inactive (admin management page)
router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/', auth, auditSpecs.announcementCreate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { title, message, category, displayDate, isActive } = req.body;

    const inputProblem = announcementInputProblem(req.body, { creating: true });
    if (inputProblem) return sendProblem(res, inputProblem);

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
    sendRouteError(res, err);
  }
});

router.put('/:id', auth, auditSpecs.announcementUpdate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { title, message, category, displayDate, isActive } = req.body;

    const inputProblem = announcementInputProblem(req.body, { creating: false });
    if (inputProblem) return sendProblem(res, inputProblem);

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
    sendRouteError(res, err);
  }
});

router.delete('/:id', auth, auditSpecs.announcementDelete, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;
