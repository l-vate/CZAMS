const auditSpecs = require('../utils/auditSpecs');
const express = require('express');
const router = express.Router();
const Closure = require('../models/Closure');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');
const { ROLE } = require('../constants/roles');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { sendProblem } = require('../utils/validation');
const { readClosureInput, isRealDateKey } = require('../utils/closures');
const { manilaTodayKey } = require('../utils/timeBlocks');

const upcoming = () => ({ date: { $gte: manilaTodayKey() } });
const shape = (c) => ({ date: c.date, reason: c.reason });

// How many Pending or Approved bookings already sit on each date. Shown to the admin as a
// warning only: closing a date never cancels or moves a booking.
async function countAffected(dates) {
  if (dates.length === 0) return new Map();
  const rows = await Booking.aggregate([
    { $match: { date: { $in: dates }, status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED] } } },
    { $group: { _id: '$date', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
}

// Public (no login): upcoming closed dates for the landing page calendar.
router.get('/public', async (req, res) => {
  try {
    const closures = await Closure.find(upcoming()).sort({ date: 1 });
    res.json(closures.map(shape));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Any logged-in user: upcoming closed dates, for the date pickers. An admin also gets the
// number of Pending or Approved bookings already on each date.
router.get('/', auth, async (req, res) => {
  try {
    const closures = await Closure.find(upcoming()).sort({ date: 1 });
    if (req.userRole !== ROLE.ADMIN) return res.json(closures.map(shape));
    const affected = await countAffected(closures.map((c) => c.date));
    res.json(closures.map((c) => ({ ...shape(c), affectedBookings: affected.get(c.date) || 0 })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: close a date.
router.post('/', auth, auditSpecs.closureCreate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) return res.status(403).json({ message: 'Forbidden' });

    const input = readClosureInput(req.body || {});
    if (input.problem) return sendProblem(res, input.problem);

    if (await Closure.exists({ date: input.values.date })) {
      return res.status(400).json({ message: 'That date is already closed.' });
    }
    let closure;
    try {
      closure = await Closure.create({ ...input.values, createdBy: req.userId });
    } catch (err) {
      if (err && err.code === 11000) return res.status(400).json({ message: 'That date is already closed.' });
      throw err;
    }
    const affected = await countAffected([closure.date]);
    res.status(201).json({ ...shape(closure), affectedBookings: affected.get(closure.date) || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: open a date again.
router.delete('/:date', auth, auditSpecs.closureDelete, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) return res.status(403).json({ message: 'Forbidden' });
    if (!isRealDateKey(req.params.date)) return res.status(400).json({ message: 'Choose a valid date (YYYY-MM-DD).' });

    const removed = await Closure.findOneAndDelete({ date: req.params.date });
    if (!removed) return res.status(404).json({ message: 'That date is not closed.' });
    res.json({ message: 'Date opened again.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
