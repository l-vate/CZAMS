const express = require('express');
const router = express.Router();
const { requireObjectId } = require('../utils/idParam');
requireObjectId(router, 'id');
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;
const MAX_TYPES = 100;

// A list of kinds from the request body, or null when it is missing or not a short list of strings.
const typeList = (value) => (Array.isArray(value) && value.length <= MAX_TYPES && value.every((t) => typeof t === 'string') ? value : null);

// Get the logged-in user's own notifications (most recent first). ?limit=n asks for more than the usual 30, up to 200.
router.get('/', auth, async (req, res) => {
  try {
    const asked = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;
    const notifications = await Notification.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// How many notifications the logged-in user has, and how many of them are unread, for each kind: [{ type, total, unread }]. The page adds the
// kinds up per category, so the counts on its tabs are exact even when the list it loads (at most 200) is shorter than what the user has.
router.get('/counts', auth, async (req, res) => {
  try {
    const rows = await Notification.aggregate([
      { $match: { user: req.userId } },
      { $group: { _id: '$type', total: { $sum: 1 }, unread: { $sum: { $cond: ['$read', 0, 1] } } } },
    ]);
    res.json(rows.map((row) => ({ type: row._id, total: row.total, unread: row.unread })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark one of the logged-in user's own notifications as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.userId });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      await notification.save();
    }

    res.json(notification);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark all of the logged-in user's notifications as read. With no body that is every one; { types } limits it to those kinds, and
// { exceptTypes } to every kind but those (the notifications page uses them to mark one category).
router.patch('/read-all', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const filter = { user: req.userId, read: false };
    if (body.types !== undefined) {
      const types = typeList(body.types);
      if (!types) return res.status(400).json({ message: 'types must be a short list of notification kinds' });
      filter.type = { $in: types };
    } else if (body.exceptTypes !== undefined) {
      const exceptTypes = typeList(body.exceptTypes);
      if (!exceptTypes) return res.status(400).json({ message: 'exceptTypes must be a short list of notification kinds' });
      filter.type = { $nin: exceptTypes };
    }
    await Notification.updateMany(
      filter,
      { read: true, readAt: new Date() }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
