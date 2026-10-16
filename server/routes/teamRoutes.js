const { ROLE } = require('../constants/roles');
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { getBusyTechnicianIds } = require('../utils/assignments');
const { listFieldTechnicians } = require('../utils/technicians');
const { TIME_BLOCKS } = require('../utils/timeBlocks');

function adminOnly(req, res, next) {
  if (req.userRole !== ROLE.ADMIN) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

// Admin: which technicians are free in a date and time block. excludeBookingId ignores that
// booking's own current assignment, so reassigning a booking does not make its own
// technicians look busy. Teams no longer exist as something to manage; technicians are
// assigned one by one.
router.get('/availability', auth, adminOnly, async (req, res) => {
  try {
    const { date, time, excludeBookingId } = req.query;
    if (!date || !TIME_BLOCKS.includes(time)) {
      return res.status(400).json({ message: 'A date and a time block (Morning or Afternoon) are required.' });
    }

    const busy = new Set(await getBusyTechnicianIds(date, time, excludeBookingId));
    const technicians = (await listFieldTechnicians(User, 'name')).sort((a, b) => String(a.name).localeCompare(String(b.name)));

    res.json({
      technicians: technicians.map((u) => ({
        _id: u._id,
        name: u.name,
        position: u.position || '',
        free: !busy.has(u._id),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
