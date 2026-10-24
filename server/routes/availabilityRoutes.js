const express = require('express');
const router = express.Router();
const { getAvailability, MAX_RANGE_DAYS, KEY_PATTERN, addDays } = require('../utils/availability');
const { availabilityLimiter } = require('../middleware/rateLimit');

// Public (no login): which dates can still be booked. Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD,
// at most about two months at a time.
router.get('/public', availabilityLimiter, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!KEY_PATTERN.test(from || '') || !KEY_PATTERN.test(to || '') || to < from) {
      return res.status(400).json({ message: 'Give a from and a to date (YYYY-MM-DD).' });
    }
    if (to > addDays(from, MAX_RANGE_DAYS - 1)) {
      return res.status(400).json({ message: `Ask for at most ${MAX_RANGE_DAYS} days at a time.` });
    }
    res.json(await getAvailability(from, to));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
