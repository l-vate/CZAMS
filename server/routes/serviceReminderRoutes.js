const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ServiceReminder = require('../models/ServiceReminder');
const { runServiceReminderCheck, deliverPendingServiceReminders } = require('../jobs/serviceReminderJob');

// Admin: view the reminder log
router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const reminders = await ServiceReminder.find()
      .populate('customer', 'name email phone')
      .populate('lastCleaningBooking', 'bookingId')
      .sort({ triggeredAt: -1 });

    res.json(reminders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: manually run the "who's due" check plus delivery on demand (the same two
// steps the daily schedule runs) — useful for testing without waiting a day.
router.post('/run', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const checkResult = await runServiceReminderCheck();
    const deliverResult = await deliverPendingServiceReminders();
    res.json({ ...checkResult, ...deliverResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
