const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const Report = require('../models/Report');
const { getWarrantyStatus } = require('../utils/warranty');

// "Typically 2-3 days after the report is filed" — the paper gives a range, not an
// exact number; this picks the sooner end as the auto-scheduled default. Admin can
// always reschedule afterward through the normal reschedule/admin-update routes.
const BACK_JOB_SCHEDULE_LEAD_DAYS = 2;

function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CZ-${year}-${rand}`;
}

function generateBackJobId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BJ-${year}-${rand}`;
}

function toDateString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Customer: report a back job (leak right after cleaning, AC not cooling soon
// after installation) on one of their own completed bookings.
router.post('/', auth, async (req, res) => {
  try {
    const { bookingId, issueDescription } = req.body;

    if (!issueDescription?.trim()) {
      return res.status(400).json({ message: 'Please describe the issue.' });
    }

    const originalBooking = await Booking.findOne({
      bookingId,
      customer: req.userId,
    }).populate('service');

    if (!originalBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (originalBooking.status !== 'Completed') {
      return res.status(400).json({ message: 'A back job can only be reported on a completed booking.' });
    }

    const existing = await BackJob.findOne({ originalBookingId: bookingId });
    if (existing) {
      return res.status(400).json({ message: 'An issue has already been reported for this booking.' });
    }

    // Warranty Tracking Module: back jobs are specifically workmanship issues, so
    // they're checked against the workmanship coverage window, not the (CZA-unit-only)
    // compressor/minor-parts unit warranty.
    const warranty = getWarrantyStatus(originalBooking);
    const withinWarranty = !!warranty.applicable && !!warranty.workmanship?.active;

    const backJobId = generateBackJobId();
    let resultingBooking = null;

    if (withinWarranty) {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + BACK_JOB_SCHEDULE_LEAD_DAYS);

      resultingBooking = await Booking.create({
        bookingId: generateBookingId(),
        customer: originalBooking.customer,
        service: originalBooking.service._id,
        unitTypes: originalBooking.unitTypes,
        brandModel: originalBooking.brandModel,
        problemDescription: issueDescription.trim(),
        date: toDateString(scheduledDate),
        time: originalBooking.time || 'Morning',
        address: originalBooking.address,
        downPaymentPercent: 0,
        paymentStatus: 'Unpaid',
        clientSuppliedUnit: originalBooking.clientSuppliedUnit,
        isBackJob: true,
        backJobId,
      });
    }

    const backJob = await BackJob.create({
      backJobId,
      originalBookingId: originalBooking.bookingId,
      originalBooking: originalBooking._id,
      customer: req.userId,
      issueDescription: issueDescription.trim(),
      warrantyCheck: {
        withinWarranty,
        coverageType: warranty.type || null,
        checkedAt: new Date(),
      },
      status: withinWarranty ? 'Scheduled' : 'Not Covered',
      resultingBooking: resultingBooking?._id || null,
      resultingBookingId: resultingBooking?.bookingId || null,
    });

    const populated = await BackJob.findById(backJob._id).populate('resultingBooking');
    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: list all back job claims (the review queue)
router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const backJobs = await BackJob.find()
      .populate('customer', 'name email phone')
      .populate({ path: 'originalBooking', populate: { path: 'service' } })
      .populate('resultingBooking')
      .sort({ reportedAt: -1 });

    // Surface the original service report's pre-existing-issue flag right here —
    // this is exactly what lets admin tell a legitimate (workmanship-caused) claim
    // apart from a pre-existing condition, without hunting down the report separately.
    const enriched = await Promise.all(backJobs.map(async (bj) => {
      const obj = bj.toObject();
      const originalReport = await Report.findOne({ bookingId: bj.originalBookingId })
        .select('preExistingIssue');
      obj.originalReportPreExistingIssue = originalReport?.preExistingIssue || null;
      return obj;
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check whether a specific booking already has a back job report (and its
// outcome) — lets the customer's booking details page show the existing claim
// instead of the report form, and blocks duplicate submissions client-side too.
router.get('/booking/:bookingId', auth, async (req, res) => {
  try {
    const backJob = await BackJob.findOne({ originalBookingId: req.params.bookingId })
      .populate('resultingBooking');

    if (!backJob) {
      return res.status(404).json({ message: 'No back job report found for this booking' });
    }

    if (req.userRole !== 'admin' && backJob.customer !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(backJob);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: mark a Not Covered claim as reviewed, once it's been handled manually
// (the paper doesn't specify what "handled" means here — outside warranty could
// become a new paid booking, or something else entirely; this route only records
// that admin has looked at it, it doesn't automate any outcome).
router.patch('/:backJobId/review', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const backJob = await BackJob.findOne({ backJobId: req.params.backJobId });
    if (!backJob) return res.status(404).json({ message: 'Back job report not found' });

    if (backJob.status !== 'Not Covered') {
      return res.status(400).json({ message: 'Only a Not Covered claim can be marked reviewed.' });
    }

    backJob.status = 'Reviewed';
    backJob.reviewedAt = new Date();
    backJob.reviewedBy = req.userId;
    await backJob.save();

    res.json(backJob);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
