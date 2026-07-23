const multer = require('multer');
const express = require('express');
const router = express.Router();
const path = require('path');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');

// ============================================
// 1. CONFIGURATION & HELPERS
// ============================================

// Multer configuration for file uploads
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
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image or PDF files are allowed'));
    }
  },
});

// Generate unique booking ID
function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CZ-${year}-${rand}`;
}

// Validate date (must be at least 5 days from today)
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

// ============================================
// 2. CUSTOMER ROUTES (Booking Management)
// ============================================

// Create a booking (initial submission with proof)
router.post('/', auth, (req, res, next) => {
  req.generatedBookingId = generateBookingId();
  next();
}, upload.single('proof'), async (req, res) => {
  try {
    const {
      service, unitTypes, brandModel, problemDescription,
      date, time, technician, address,
      downPaymentPercent, paymentMode, paymentMode2,
    } = req.body;

    if (!isDateAllowed(date)) {
      return res.status(400).json({ 
        message: 'Selected date must be at least 5 days from today.' 
      });
    }

    const proofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;
    const paymentStatus = proofFile ? 'to_verify' : 'Unpaid';

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

// Get logged-in user's bookings (customer side)
router.get('/mine', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ customer: req.userId })
      .populate('service')
      .populate('technician', 'name')
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
    }).populate('service').populate('technician', 'name');

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

// Customer: Submit/upload initial down payment proof
router.patch('/:bookingId/pay', auth, upload.single('proof'), async (req, res) => {
  try {
    const proofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;

    const updateData = { paymentStatus: 'to_verify' };
    if (proofFile) updateData.proofFile = proofFile;

    const booking = await Booking.findOneAndUpdate(
      { bookingId: req.params.bookingId, customer: req.userId },
      updateData,
      { new: true }
    ).populate('service');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Customer: Submit/upload final balance payment proof
router.patch('/:bookingId/pay-balance', auth, upload.single('proof'), async (req, res) => {
  try {
    const proofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;

    const updateData = { balancePaymentStatus: 'to_verify' };
    if (proofFile) updateData.balanceProofFile = proofFile;

    const booking = await Booking.findOneAndUpdate(
      { bookingId: req.params.bookingId, customer: req.userId },
      updateData,
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
      return res.status(400).json({ 
        message: 'New date must be at least 5 days from today.' 
      });
    }

    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId, 
      customer: req.userId 
    });
    
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.status === 'Pending') {
      booking.date = date;
      booking.time = time;
      booking.rescheduleRequest = { 
        requestedDate: null, 
        requestedTime: null, 
        status: 'None' 
      };
    } else if (['Approved', 'In Progress'].includes(booking.status)) {
      booking.rescheduleRequest = { 
        requestedDate: date, 
        requestedTime: time, 
        status: 'Pending' 
      };
    } else {
      return res.status(400).json({ 
        message: 'This booking can no longer be rescheduled.' 
      });
    }

    await booking.save();
    const populated = await booking.populate('service');
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// 3. TECHNICIAN ROUTES
// ============================================

// Get jobs assigned to the logged-in technician
router.get('/technician/mine', auth, async (req, res) => {
  try {
    const jobs = await Booking.find({ technician: req.userId })
      .populate('service')
      .populate('customer', 'name phone')
      .sort({ date: -1 });
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get dashboard stats for the logged-in technician
router.get('/technician/mine/stats', auth, async (req, res) => {
  try {
    const jobs = await Booking.find({ technician: req.userId })
      .populate('customer', 'name');
    
    const ongoing = jobs.filter(j => ['Approved', 'In Progress'].includes(j.status)).length;
    const completed = jobs.filter(j => j.status === 'Completed').length;
    const pendingReports = jobs.filter(j => j.status === 'Completed' && !j.report?.submittedAt).length;
    const feedbacks = jobs
      .filter(j => j.feedback?.text)
      .map(j => ({ 
        name: j.customer?.name || 'Customer', 
        text: j.feedback.text, 
        rating: j.feedback.rating 
      }));

    res.json({ ongoing, completed, pendingReports, feedbacks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get busy technicians for a specific date
router.get('/busy-technicians', auth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'Date is required' });

    const busyBookings = await Booking.find({
      date,
      status: { $in: ['Pending', 'Approved', 'In Progress'] }
    });

    const busyTechIds = busyBookings
      .map(b => b.technician?.toString())
      .filter(Boolean);

    res.json({ busyTechIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit a report (technician marks job complete)
router.patch('/:bookingId/report', auth, async (req, res) => {
  try {
    const { workSummary, partsUsed, recommendations, laborHours, issueResolution, followUpRequired, followUpDate, notes } = req.body;
    
    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId 
    }).populate('service customer');
    
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    
    if (booking.technician !== req.userId) {
      return res.status(403).json({ message: 'Not your booking' });
    }

    // Validate required fields
    if (!workSummary?.trim()) {
      return res.status(400).json({ message: 'Work summary is required' });
    }

    if (followUpRequired && !followUpDate) {
      return res.status(400).json({ message: 'Follow-up date is required when follow-up is needed' });
    }

    booking.report = { 
      // Original fields
      workSummary: workSummary.trim(), 
      partsUsed: partsUsed?.trim() || null,
      recommendations: recommendations?.trim() || null,
      
      // New fields
      laborHours: laborHours ? parseFloat(laborHours) : null,
      issueResolution: issueResolution || 'Partial', // 'Complete', 'Partial', 'Unresolved'
      followUpRequired: followUpRequired || false,
      followUpDate: followUpRequired ? new Date(followUpDate) : null,
      notes: notes?.trim() || null,
      
      // System fields
      submittedAt: new Date(),
      submittedBy: req.userId,
    };
    
    booking.status = 'Completed';
    booking.completedAt = new Date();
    
    await booking.save();

    // Return fully populated booking with all related data
    const populated = await booking.populate(['service', 'customer', 'technician']);
    
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// 4. ADMIN ROUTES
// ============================================

// List all bookings (admin only)
router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const bookings = await Booking.find()
      .populate('service')
      .populate('customer', 'name email')
      .populate('technician', 'name')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: approve a pending reschedule request
router.patch('/:bookingId/reschedule/approve', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId 
    });
    
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    
    if (booking.rescheduleRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending reschedule request.' });
    }
    
    booking.date = booking.rescheduleRequest.requestedDate;
    booking.time = booking.rescheduleRequest.requestedTime;
    booking.rescheduleRequest = { 
      requestedDate: null, 
      requestedTime: null, 
      status: 'Approved' 
    };
    
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
    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId 
    });
    
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

// Admin: assign technician and/or review payment verification
router.patch('/:bookingId/admin-update', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { technician, status, paymentStatus, balancePaymentStatus, balancePaid } = req.body;
    const allowedStatuses = ['Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId 
    });
    
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    
    if (booking.status === 'Cancelled') {
      return res.status(400).json({ 
        message: 'This booking is cancelled and can no longer be edited.' 
      });
    }

    // Assign technician
    if (technician !== undefined) {
      booking.technician = technician || undefined;
    }

    // Validate technician assignment before approving
    if (status === 'Approved' && !booking.technician) {
      return res.status(400).json({ 
        message: 'Assign a technician before approving.' 
      });
    }

    // Update status
    if (status) booking.status = status;

    // ── Down payment track ──
    if (paymentStatus === 'rejected') {
      booking.paymentStatus = 'rejected';
      booking.proofFile = undefined;
    } else if (paymentStatus) {
      booking.paymentStatus = paymentStatus;
    }

    // ── Balance payment track ──
    if (balancePaymentStatus === 'rejected') {
      booking.balancePaymentStatus = 'rejected';
      booking.balanceProofFile = undefined;
    } else if (balancePaymentStatus) {
      booking.balancePaymentStatus = balancePaymentStatus;
    }

    // Handle balance payment
    if (balancePaid !== undefined) {
      booking.balancePaid = balancePaid;
      if (balancePaid) {
        booking.balancePaymentStatus = 'paid';
        booking.paymentStatus = 'fully_paid';
      }
    }

    await booking.save();

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email' },
      { path: 'technician', select: 'name' },
    ]);
    
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// 5. ERROR HANDLING
// ============================================

// Handle multer errors (file too large, wrong type)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        message: 'File is too large. Max size is 5MB.' 
      });
    }
    return res.status(400).json({ 
      message: 'File upload error: ' + err.message 
    });
  }
  if (err.message === 'Only image or PDF files are allowed') {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

module.exports = router;