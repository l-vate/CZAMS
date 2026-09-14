const multer = require('multer');
const express = require('express');
const router = express.Router();
const path = require('path');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { getWarrantyStatus } = require('../utils/warranty');
const { sendNotification } = require('../utils/notifications');

// Every route that returns a booking should include its computed warranty status,
// otherwise the admin/customer detail views lose that section the moment any other
// field gets updated (same class of bug as Customer Classification's PUT /:id fix).
function withWarranty(booking) {
  const obj = booking.toObject();
  obj.warranty = getWarrantyStatus(booking);
  return obj;
}

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

// Validate date (must be at least 3 days from today)
function isDateAllowed(dateStr) {
  if (!dateStr) return false;

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 3);
  minDate.setHours(0, 0, 0, 0);

  const selected = new Date(dateStr);
  if (isNaN(selected)) return false;
  selected.setHours(0, 0, 0, 0);

  return selected >= minDate;
}

// Local YYYY-MM-DD for today, for same-day-cancellation comparisons against booking.date
function todayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Opens a refund request on a booking that's about to be cancelled, but only if a
// down payment was actually on file (cleaning bookings with no down payment simply
// stay 'None'). Shared by the customer-initiated /cancel route and the admin-initiated
// /admin-update route so both cancellation paths open refunds the same way. Requires
// booking.service to already be populated (needed for the price).
function openRefundIfEligible(booking) {
  const hasDownPaymentOnFile =
    booking.downPaymentPercent > 0 &&
    !['Unpaid', 'rejected'].includes(booking.paymentStatus);

  if (!hasDownPaymentOnFile) return;

  const basePrice = booking.service?.price || 0;
  const downPaymentAmount = Math.round(basePrice * (booking.downPaymentPercent / 100));
  const isSameDay = booking.date === todayDateString();

  booking.refund = {
    status: 'Pending',
    isSameDay,
    downPaymentAmount,
    // Same-day: the dispatch/transportation deduction isn't known until admin
    // reviews it, so the refundable amount stays unset until then.
    dispatchDeduction: isSameDay ? undefined : 0,
    refundableAmount: isSameDay ? undefined : downPaymentAmount,
    requestedAt: new Date(),
  };
}

// ============================================
// 2. CUSTOMER ROUTES (Booking Management)
// ============================================

// Create a booking (initial submission with proof). Normally the caller is the
// customer themselves; an admin creating a walk-in/phone-in booking on someone
// else's behalf may pass `customer` to book it under that customer's account
// instead — only admins can do this, everyone else always books under their own id.
router.post('/', auth, (req, res, next) => {
  req.generatedBookingId = generateBookingId();
  next();
}, upload.single('proof'), async (req, res) => {
  try {
    const {
      service, unitTypes, brandModel, problemDescription,
      date, time, technician, address,
      downPaymentPercent, paymentMode, paymentMode2,
      customer, clientSuppliedUnit, unitWaiverAcknowledged, unitWaiverName,
    } = req.body;

    if (!isDateAllowed(date)) {
      return res.status(400).json({
        message: 'Selected date must be at least 3 days from today.'
      });
    }

    // Warranty Tracking Module: a client-supplied unit on an installation booking
    // has no Unit Warranty, so a signed waiver acknowledging that is required.
    const isClientSuppliedUnit = clientSuppliedUnit === 'true' || clientSuppliedUnit === true;
    const isWaiverAcknowledged = unitWaiverAcknowledged === 'true' || unitWaiverAcknowledged === true;
    if (isClientSuppliedUnit && (!isWaiverAcknowledged || !unitWaiverName?.trim())) {
      return res.status(400).json({
        message: 'A signed waiver is required when the client supplies their own unit.'
      });
    }

    let bookingCustomerId = req.userId;
    let isAdminWalkIn = false;
    if (req.userRole === 'admin' && customer) {
      const targetCustomer = await User.findById(customer);
      if (!targetCustomer) {
        return res.status(400).json({ message: 'Selected customer account not found.' });
      }
      bookingCustomerId = customer;
      isAdminWalkIn = true;
    }

    const proofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;

    // A walk-in booking's admin is physically/verbally confirming payment on the
    // spot, so with no proof to check it's marked paid immediately instead of
    // sitting in the Payments queue looking like an unresolved to-verify item with
    // nothing to review. If the admin did attach proof (e.g. a GCash screenshot),
    // it still goes through the normal to_verify review like any other booking.
    // A 0% down payment (the Customer Classification return-customer perk) is the
    // one case where nothing was actually collected, so it stays 'Unpaid' either way.
    let paymentStatus;
    if (proofFile) {
      paymentStatus = 'to_verify';
    } else if (isAdminWalkIn && Number(downPaymentPercent) > 0) {
      paymentStatus = Number(downPaymentPercent) >= 100 ? 'fully_paid' : 'partially_paid';
    } else {
      paymentStatus = 'Unpaid';
    }

    const booking = await Booking.create({
      bookingId: req.generatedBookingId,
      customer: bookingCustomerId,
      service, unitTypes, brandModel, problemDescription,
      date, time, technician, address,
      downPaymentPercent, paymentMode, paymentMode2,
      paymentStatus, proofFile,
      clientSuppliedUnit: isClientSuppliedUnit,
      unitWaiver: isClientSuppliedUnit ? {
        acknowledged: true,
        customerName: unitWaiverName.trim(),
        acknowledgedAt: new Date(),
      } : undefined,
    });

    const populated = await booking.populate('service');

    await sendNotification(
      bookingCustomerId,
      'booking_created',
      `Your booking ${populated.bookingId} for ${populated.service?.name || 'a service'} has been submitted and is pending confirmation.`,
      { booking: populated }
    );

    res.status(201).json(withWarranty(populated));
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

    const enriched = bookings.map((b) => {
      const obj = b.toObject();
      obj.warranty = getWarrantyStatus(b);
      return obj;
    });
    res.json(enriched);
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

    const obj = booking.toObject();
    obj.warranty = getWarrantyStatus(booking);
    res.json(obj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel a booking. If a down payment was actually on file, this also opens a
// refund request (Cancellation, Rescheduling, and Refund Module) — same-day
// cancellations get flagged so the dispatch/transportation cost can be deducted
// before an admin processes it; pre-service cancellations refund in full.
router.patch('/:bookingId/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      customer: req.userId,
    }).populate('service');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (!['Pending', 'Approved', 'In Progress'].includes(booking.status)) {
      return res.status(400).json({ message: 'This booking can no longer be cancelled.' });
    }

    openRefundIfEligible(booking);

    booking.status = 'Cancelled';
    await booking.save();

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
    ]);
    res.json(withWarranty(populated));
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
    res.json(withWarranty(booking));
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
    res.json(withWarranty(booking));
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
        message: 'New date must be at least 3 days from today.'
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
    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit or edit feedback for a completed booking (customer)
const FEEDBACK_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

router.patch('/:bookingId/feedback', auth, async (req, res) => {
  try {
    const { rating, text } = req.body;
    const parsedRating = Number(rating);

    if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ message: 'A rating from 1 to 5 is required.' });
    }

    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      customer: req.userId,
    });

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.status !== 'Completed') {
      return res.status(400).json({ message: 'Feedback can only be left once the service is completed.' });
    }

    const previouslySubmittedAt = booking.feedback?.createdAt;
    if (previouslySubmittedAt && Date.now() - new Date(previouslySubmittedAt).getTime() > FEEDBACK_EDIT_WINDOW_MS) {
      return res.status(400).json({ message: 'Feedback can no longer be edited (24-hour window has passed).' });
    }

    booking.feedback = {
      text: text?.trim() || '',
      rating: parsedRating,
      createdAt: previouslySubmittedAt || new Date(),
    };

    await booking.save();
    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
    ]);
    res.json(withWarranty(populated));
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

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Technician: report a disruption on a job that's underway (interrupted, or
// running longer than scheduled). This only records the report — admin reschedules
// separately (see /:bookingId/disruption/reschedule below), which is when both
// parties actually get notified.
router.patch('/:bookingId/disruption/report', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ message: 'Please describe what happened.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.technician !== req.userId) {
      return res.status(403).json({ message: 'Not your booking' });
    }

    if (booking.status !== 'In Progress') {
      return res.status(400).json({ message: 'A disruption can only be reported on a job that is in progress.' });
    }

    if (booking.disruption?.status === 'Reported') {
      return res.status(400).json({ message: 'A disruption has already been reported for this booking.' });
    }

    booking.disruption = {
      status: 'Reported',
      reason: reason.trim(),
      reportedAt: new Date(),
      reportedBy: req.userId,
    };

    await booking.save();
    const populated = await booking.populate(['service', 'technician']);
    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Technician: request an extra day to finish a job that's underway — this isn't
// automatic, admin has to approve it (see /:bookingId/extension/approve|deny below).
router.patch('/:bookingId/extension/request', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ message: 'Please describe why more time is needed.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.technician !== req.userId) {
      return res.status(403).json({ message: 'Not your booking' });
    }

    if (booking.status !== 'In Progress') {
      return res.status(400).json({ message: 'An extension can only be requested on a job that is in progress.' });
    }

    if (booking.extensionRequest?.status === 'Pending') {
      return res.status(400).json({ message: 'An extension request is already pending for this booking.' });
    }

    booking.extensionRequest = {
      status: 'Pending',
      reason: reason.trim(),
      requestedAt: new Date(),
      requestedBy: req.userId,
    };

    await booking.save();
    const populated = await booking.populate(['service', 'technician']);
    res.json(withWarranty(populated));
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
      .populate('customer', 'name email clientType')
      .populate('technician', 'name')
      .sort({ createdAt: -1 });

    const enriched = bookings.map((b) => {
      const obj = b.toObject();
      obj.warranty = getWarrantyStatus(b);
      return obj;
    });
    res.json(enriched);
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
    res.json(withWarranty(populated));
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
    res.json(withWarranty(populated));
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

    const { technician, status, paymentStatus, balancePaymentStatus, balancePaid, technicianInstructions } = req.body;
    const allowedStatuses = ['Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await Booking.findOne({
      bookingId: req.params.bookingId
    }).populate('service');

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

    // Pre-service technician instructions (Service Report Module)
    if (technicianInstructions !== undefined) {
      booking.technicianInstructions = technicianInstructions;
    }

    // Validate technician assignment before approving
    if (status === 'Approved' && !booking.technician) {
      return res.status(400).json({
        message: 'Assign a technician before approving.'
      });
    }

    // Admin-initiated cancellation opens the same refund request the customer's own
    // /cancel route would, and is bound by the same rule: only bookings still
    // Pending/Approved/In Progress can be cancelled (never a Completed one).
    if (status === 'Cancelled') {
      if (!['Pending', 'Approved', 'In Progress'].includes(booking.status)) {
        return res.status(400).json({ message: 'This booking can no longer be cancelled.' });
      }
      openRefundIfEligible(booking);
    }

    // Admin Dashboard + Analytics Module: capture the first time this booking is
    // approved (for the "average response time" metric) — never overwritten on
    // later edits, so re-approving after a status change doesn't reset it.
    if (status === 'Approved' && !booking.approvedAt) {
      booking.approvedAt = new Date();
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

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: process a pending refund. Requires proof the money was actually sent back
// (same upload mechanism as customer proof-of-payment) before it can be marked
// Processed. Same-day cancellations also require a dispatch/transportation
// deduction before the refundable amount is finalized; pre-service cancellations
// refund the down payment in full.
router.patch('/:bookingId/refund', auth, upload.single('proof'), async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.refund?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending refund for this booking.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Proof that the refund was sent is required before marking it processed.' });
    }

    if (booking.refund.isSameDay) {
      const dispatchDeduction = Number(req.body.dispatchDeduction);
      if (isNaN(dispatchDeduction) || dispatchDeduction < 0) {
        return res.status(400).json({ message: 'A valid dispatch/transportation deduction amount is required for a same-day cancellation.' });
      }
      booking.refund.dispatchDeduction = dispatchDeduction;
      booking.refund.refundableAmount = Math.max(booking.refund.downPaymentAmount - dispatchDeduction, 0);
    }

    booking.refund.proofFile = `/uploads/proofs/${req.file.filename}`;
    booking.refund.status = 'Processed';
    booking.refund.processedAt = new Date();
    booking.refund.processedBy = req.userId;

    await booking.save();

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email' },
      { path: 'technician', select: 'name' },
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Customer: flag a refund that hasn't come through (e.g. marked Processed but
// never actually received). Single message + status, not a ticketing thread —
// admin just needs to see it and mark it addressed once followed up outside the system.
router.patch('/:bookingId/refund/flag', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ message: 'Please describe the issue.' });
    }

    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      customer: req.userId,
    });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (!booking.refund || booking.refund.status === 'None') {
      return res.status(400).json({ message: 'There is no refund on this booking to flag.' });
    }

    if (booking.refund.customerFlag?.flagged && !booking.refund.customerFlag?.resolved) {
      return res.status(400).json({ message: "You've already flagged this refund — our team will follow up." });
    }

    booking.refund.customerFlag = {
      flagged: true,
      message: message.trim(),
      flaggedAt: new Date(),
      resolved: false,
    };

    await booking.save();

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: mark a customer's refund flag as addressed (followed up outside the
// system — a phone call, etc.) so it stops showing as needing attention.
router.patch('/:bookingId/refund/flag/resolve', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (!booking.refund?.customerFlag?.flagged) {
      return res.status(400).json({ message: 'This refund has no flag to resolve.' });
    }

    booking.refund.customerFlag.resolved = true;
    booking.refund.customerFlag.resolvedAt = new Date();
    booking.refund.customerFlag.resolvedBy = req.userId;

    await booking.save();

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email' },
      { path: 'technician', select: 'name' },
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: reschedule a booking that had a disruption reported on it. This is the
// exact hook point Notification Sender was built for — both the client and the
// assigned technician are notified right away as part of this action.
router.patch('/:bookingId/disruption/reschedule', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { date, time } = req.body;
    if (!date || !time) {
      return res.status(400).json({ message: 'A new date and time are required.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.disruption?.status !== 'Reported') {
      return res.status(400).json({ message: 'No reported disruption for this booking.' });
    }

    booking.date = date;
    booking.time = time;
    // Nobody is actively working on it during the gap until the new date — back to
    // 'Approved' (scheduled, not in progress) rather than leaving it looking active.
    booking.status = 'Approved';
    booking.disruption.status = 'Rescheduled';
    booking.disruption.rescheduledAt = new Date();

    await booking.save();

    const message = `Booking ${booking.bookingId} (${booking.service?.name || 'service'}) was interrupted and has been rescheduled to ${date}, ${time}.`;
    await sendNotification(booking.customer, 'disruption_rescheduled', message, { booking });
    if (booking.technician) {
      await sendNotification(booking.technician, 'disruption_rescheduled', message, { booking });
    }

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email' },
      { path: 'technician', select: 'name' },
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: approve a pending extension request — grants the extra day. Notifies the
// requesting technician and the client, whose completion timeline just changed.
router.patch('/:bookingId/extension/approve', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.extensionRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending extension request for this booking.' });
    }

    booking.extensionRequest.status = 'Approved';
    booking.extensionRequest.decidedAt = new Date();
    booking.extensionRequest.decidedBy = req.userId;

    await booking.save();

    if (booking.technician) {
      await sendNotification(
        booking.technician,
        'extension_approved',
        `Your extension request for booking ${booking.bookingId} has been approved.`,
        { booking }
      );
    }
    await sendNotification(
      booking.customer,
      'extension_approved',
      `Your technician requested an extra day to finish booking ${booking.bookingId} — this has been approved, so completion will take a bit longer than originally scheduled.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email' },
      { path: 'technician', select: 'name' },
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: deny a pending extension request. Notifies the requesting technician and the client.
router.patch('/:bookingId/extension/deny', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.extensionRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending extension request for this booking.' });
    }

    booking.extensionRequest.status = 'Denied';
    booking.extensionRequest.decidedAt = new Date();
    booking.extensionRequest.decidedBy = req.userId;

    await booking.save();

    if (booking.technician) {
      await sendNotification(
        booking.technician,
        'extension_denied',
        `Your extension request for booking ${booking.bookingId} was not approved.`,
        { booking }
      );
    }
    await sendNotification(
      booking.customer,
      'extension_denied',
      `Your technician's request for extra time on booking ${booking.bookingId} was not approved — your original schedule stands.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email' },
      { path: 'technician', select: 'name' },
    ]);

    res.json(withWarranty(populated));
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