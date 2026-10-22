const auditSpecs = require('../utils/auditSpecs');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const TechnicianOff = require('../models/TechnicianOff');
const User = require('../models/User');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');
const { ROLE } = require('../constants/roles');
const { sendProblem } = require('../utils/validation');
const { listFieldTechnicians } = require('../utils/technicians');
const { readOffInput } = require('../utils/technicianOff');
const { activeStatuses, getMemberIds } = require('../utils/assignments');
const { slotsOf } = require('../utils/extensionDays');
const { manilaTodayKey } = require('../utils/timeBlocks');

// Admin only: technicians the admin marked as not available on a date. Marking someone off never cancels or moves a booking: the
// answer says which bookings that technician already has in those blocks, so the admin can reassign them.
router.use(auth, (req, res, next) => (req.userRole === ROLE.ADMIN ? next() : res.status(403).json({ message: 'Forbidden' })));

const shape = (o, names) => ({
  _id: String(o._id),
  technician: o.technician,
  technicianName: names.get(o.technician) || 'Unknown technician',
  date: o.date,
  blocks: o.blocks,
  reason: o.reason || '',
});

// Bookings (Pending, Approved, In Progress) these technicians already have in the blocks just marked off.
async function bookingsInTheWay(technicianIds, date, blocks) {
  const bookings = await Booking.find({
    status: { $in: activeStatuses() },
    $or: [{ date }, { extensionDays: { $elemMatch: { date } } }],
  }).select('bookingId date time technician assignments extensionDays');
  const wanted = new Set(technicianIds);
  const names = [];
  bookings.forEach((b) => {
    if (!slotsOf(b).some((s) => s.date === date && blocks.includes(s.time))) return;
    const mine = getMemberIds(b).filter((id) => wanted.has(id));
    if (mine.length > 0) names.push({ bookingId: b.bookingId, technicians: mine });
  });
  return names;
}

router.get('/', async (req, res) => {
  try {
    const rows = await TechnicianOff.find({ date: { $gte: manilaTodayKey() } }).sort({ date: 1 }).lean();
    const users = await User.find({ _id: { $in: [...new Set(rows.map((r) => r.technician))] } }).select('name').lean();
    const names = new Map(users.map((u) => [String(u._id), u.name]));
    res.json(rows.map((r) => shape(r, names)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark one or more technicians off on a date. Setting a technician who is already off that day replaces the blocks and reason.
router.post('/', auditSpecs.technicianOffCreate, async (req, res) => {
  try {
    const field = await listFieldTechnicians(User, 'name');
    const input = readOffInput(req.body || {}, field.map((t) => String(t._id)));
    if (input.problem) return sendProblem(res, input.problem);
    const { technicians, date, blocks, reason } = input.values;

    await Promise.all(technicians.map((technician) => TechnicianOff.findOneAndUpdate(
      { technician, date },
      { $set: { blocks, reason, createdBy: req.userId } },
      { upsert: true, returnDocument: 'after' },
    )));
    const inTheWay = await bookingsInTheWay(technicians, date, blocks);
    res.status(201).json({ message: 'Saved.', bookingsInTheWay: inTheWay });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark the technician as available again.
router.delete('/:id', auditSpecs.technicianOffDelete, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Not a valid entry.' });
    const removed = await TechnicianOff.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ message: 'That entry does not exist.' });
    res.json({ message: 'Available again.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
