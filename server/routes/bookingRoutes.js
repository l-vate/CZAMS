const multer = require('multer')
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/proofs'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = req.generatedBookingId || req.params.bookingId || 'unknown';
    cb(null, `${id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only image or PDF files are allowed'));
  },
});

function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CZ-${year}-${rand}`;
}

function isDateAllowed(dateStr) {
  if (!dateStr) return false;
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 5);
  minDate.setHours(0, 0, 0, 0);

  const selected = new Date(dateStr);
  if (isNaN(selected)) return false;
  selected.setHours(0, 0, 0, 0);

  return selected >= minDate;
}

// Create a booking
router.post('/', auth, (req, res, next) => {
  req.generatedBookingId = generateBookingId();
  next();
}, upload.single('proof'), async (req, res) => {
  try {
    const {
      service, unitTypes, brandModel, problemDescription,
      date, time, technician, address,
      downPaymentPercent, paymentMode, paymentMode2,
      paymentStatus,
    } = req.body;

    if (!isDateAllowed(date)) {
      return res.status(400).json({ message: 'Selected date must be at least 5 days from today.' });
    }

    const proofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;

    const booking = await Booking.create({
      bookingId: req.generatedBookingId,
      customer: req.userId,
      service, unitTypes, brandModel, problemDescription,
      date, time, technician, address,
      downPaymentPercent, paymentMode, paymentMode2,
      paymentStatus, proofFile,
    });

    const populated = await booking.populate('service');
    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get logged-in user's bookings
router.get('/mine', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ customer: req.userId })
      .populate('service')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single booking by bookingId
router.get('/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      customer: req.userId,
    }).populate('service');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel a booking
router.patch('/:bookingId/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { bookingId: req.params.bookingId, customer: req.userId },
      { status: 'Cancelled' },
      { new: true }
    ).populate('service');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Settle/pay a booking
router.patch('/:bookingId/pay', auth, upload.single('proof'), async (req, res) => {
  console.log('=== PAY ROUTE HIT ===');
  console.log('req.file:', req.file);
  console.log('req.body:', req.body);
  try {
    const proofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;
    console.log('computed proofFile:', proofFile);

    const booking = await Booking.findOneAndUpdate(
      { bookingId: req.params.bookingId, customer: req.userId },
      { paymentStatus: 'Paid', proofFile },
      { new: true }
    ).populate('service');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:bookingId/pay-balance', auth, upload.single('proof'), async (req, res) => {
  try {
    const balanceProofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;

    const booking = await Booking.findOneAndUpdate(
      { bookingId: req.params.bookingId, customer: req.userId },
      { balancePaid: true, balanceProofFile },
      { new: true }
    ).populate('service');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Request a reschedule (or apply directly if still Pending)
router.patch('/:bookingId/reschedule', auth, async (req, res) => {
  try {
    const { date, time } = req.body;

    if (!isDateAllowed(date)) {
      return res.status(400).json({ message: 'New date must be at least 5 days from today.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.status === 'Pending') {
      // No approval needed yet — apply immediately
      booking.date = date;
      booking.time = time;
      booking.rescheduleRequest = { requestedDate: null, requestedTime: null, status: 'None' };
    } else if (['Approved', 'In Progress'].includes(booking.status)) {
      // Needs admin approval
      booking.rescheduleRequest = { requestedDate: date, requestedTime: time, status: 'Pending' };
    } else {
      return res.status(400).json({ message: 'This booking can no longer be rescheduled.' });
    }

    await booking.save();
    const populated = await booking.populate('service');
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: approve a pending reschedule request
router.patch('/:bookingId/reschedule/approve', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.rescheduleRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending reschedule request.' });
    }
    booking.date = booking.rescheduleRequest.requestedDate;
    booking.time = booking.rescheduleRequest.requestedTime;
    booking.rescheduleRequest = { requestedDate: null, requestedTime: null, status: 'Approved' };
    await booking.save();
    const populated = await booking.populate('service');
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: deny a pending reschedule request
router.patch('/:bookingId/reschedule/deny', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.rescheduleRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending reschedule request.' });
    }
    booking.rescheduleRequest.status = 'Denied';
    await booking.save();
    const populated = await booking.populate('service');
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;