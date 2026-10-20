const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { TIME_BLOCK } = require('../constants/timeBlocks');
const { ROLE } = require('../constants/roles');
const { BACK_JOB_STATUS, OPEN_BACK_JOB_STATUSES } = require('../constants/backJobStatus');
const { PAYMENT_STATUS } = require('../constants/paymentStatus');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const auditSpecs = require('../utils/auditSpecs');
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { allowRoles } = require('../middleware/roles');
const { toCustomerBackJob } = require('../utils/customerView');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const Report = require('../models/Report');
const { getWarrantyStatus } = require('../utils/warranty');
const { notifyAdmins, sendNotification } = require('../utils/notifications');
const { sendRouteError } = require('../utils/routeErrors');
const { manilaToday, addDaysManila } = require('../utils/manilaDate');
const { nextBusinessDay } = require('../utils/businessDays');
const { nextQueueRank } = require('../utils/queue');
const Closure = require('../models/Closure');
const {
  createWithUniqueBookingId, BookingIdExhaustedError,
  createWithUniqueBackJobId, BackJobIdExhaustedError,
} = require('../utils/bookingId');

// "Typically 2-3 days after the report is filed" - the paper gives a range, not an
// exact number; this picks the sooner end as the auto-scheduled default. Admin can
// always reschedule afterward through the normal reschedule/admin-update routes.
const BACK_JOB_SCHEDULE_LEAD_DAYS = 2;

// The date of the free visit: two days after the claim, in Manila, moved to the next business day when that day is a
// Sunday (while Sundays are closed) or a shop closure date (utils/businessDays.js).
async function visitDate() {
  const wanted = addDaysManila(manilaToday(), BACK_JOB_SCHEDULE_LEAD_DAYS);
  const closures = await Closure.find({ date: { $gte: wanted, $lte: addDaysManila(wanted, 60) } }).select('date').lean();
  return nextBusinessDay(wanted, new Set(closures.map((c) => c.date)), { inclusive: true });
}

// True for a duplicate key error on the one-open-claim-per-booking index.
const isDuplicateClaim = (err) => err && err.code === 11000 && (!err.keyPattern || 'originalBookingId' in err.keyPattern);

// Customer: report a back job (leak right after cleaning, AC not cooling soon
// after installation) on one of their own completed bookings.
router.post('/', auth, allowRoles(ROLE.CUSTOMER), async (req, res) => {
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

    if (originalBooking.status !== BOOKING_STATUS.COMPLETED) {
      return res.status(400).json({ message: 'A back job can only be reported on a completed booking.' });
    }

    // A free repair visit cannot itself be claimed against: the claim belongs to the booking the visit was for.
    if (originalBooking.isBackJob) {
      const visitClaim = await BackJob.findOne({ backJobId: originalBooking.backJobId });
      const original = visitClaim ? ` Report it against booking ${visitClaim.originalBookingId}.` : '';
      return res.status(400).json({ message: `This is a free repair visit, so it cannot have its own claim.${original}` });
    }

    const existing = await BackJob.findOne({ originalBookingId: bookingId, status: { $in: OPEN_BACK_JOB_STATUSES } });
    if (existing) {
      return res.status(400).json({ message: 'A claim already exists for this booking.' });
    }

    // Warranty Tracking Module: back jobs are specifically workmanship issues, so
    // they're checked against the workmanship coverage window, not the (CZA-unit-only)
    // compressor/minor-parts unit warranty.
    const warranty = getWarrantyStatus(originalBooking);
    const withinWarranty = !!warranty.applicable && !!warranty.workmanship?.active;

    // The free repair visit (when covered) and the back job record share the back job ID. If the
    // ID turns out to be taken, the visit made for it is removed and both are made again with a new one.
    const { backJob, resultingBooking } = await createWithUniqueBackJobId(async (backJobId) => {
      let resultingBooking = null;

      if (withinWarranty) {
        const scheduledDate = await visitDate();
        const queueRank = await nextQueueRank(); // joins the Pending queue like any request; the admin assigns it

        resultingBooking = await createWithUniqueBookingId((bookingId) => Booking.create({
          bookingId,
          queueRank,
          customer: originalBooking.customer,
          service: originalBooking.service._id,
          units: (originalBooking.units || []).map(({ type, quantity, brandModel, hp }) => ({ type, quantity, brandModel, hp })),
          unitTypes: originalBooking.unitTypes,
          brandModel: originalBooking.brandModel,
          problemDescription: issueDescription.trim(),
          date: scheduledDate,
          time: originalBooking.time || TIME_BLOCK.MORNING,
          address: originalBooking.address,
          contactNumber: originalBooking.contactNumber,
          downPaymentPercent: 0,
          paymentStatus: PAYMENT_STATUS.UNPAID,
          clientSuppliedUnit: originalBooking.clientSuppliedUnit,
          isBackJob: true,
          backJobId,
        }));
      }

      try {
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
          status: withinWarranty ? BACK_JOB_STATUS.SCHEDULED : BACK_JOB_STATUS.NOT_COVERED,
          resultingBooking: resultingBooking?._id || null,
          resultingBookingId: resultingBooking?.bookingId || null,
        });
        return { backJob, resultingBooking };
      } catch (err) {
        // the free visit means nothing without its claim, whatever stopped the claim from being saved
        if (resultingBooking) await Booking.deleteOne({ _id: resultingBooking._id });
        throw err;
      }
    });

    await notifyAdmins(
      NOTIFICATION_TYPE.BACKJOB_FILED,
      withinWarranty
        ? `Back job ${backJob.backJobId} filed on booking ${originalBooking.bookingId}: WITHIN warranty (${warranty.type}). A free repair visit was scheduled for ${resultingBooking.date}.`
        : `Back job ${backJob.backJobId} filed on booking ${originalBooking.bookingId}: NOT covered by warranty. Needs your review.`,
      { booking: originalBooking }
    );

    // the customer is told what became of the claim straight away (the system decides it from the warranty window)
    await sendNotification(
      originalBooking.customer,
      NOTIFICATION_TYPE.BACKJOB_RECEIVED,
      withinWarranty
        ? `We received your claim ${backJob.backJobId} for booking ${originalBooking.bookingId}. It is covered by your warranty, so the repair visit is free and is scheduled for ${resultingBooking.date}, ${resultingBooking.time}. Our team will assign a technician.`
        : `We received your claim ${backJob.backJobId} for booking ${originalBooking.bookingId}. It is outside the warranty period, so our team will review it and get in touch.`,
      { booking: originalBooking }
    );

    const populated = await BackJob.findById(backJob._id).populate('resultingBooking');
    res.status(201).json(toCustomerBackJob(populated));
  } catch (err) {
    if (isDuplicateClaim(err)) return res.status(400).json({ message: 'A claim already exists for this booking.' });
    if (err instanceof BookingIdExhaustedError || err instanceof BackJobIdExhaustedError) { console.error(err); return res.status(500).json({ message: err.message }); }
    sendRouteError(res, err);
  }
});

// Admin: list all back job claims (the review queue)
router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const backJobs = await BackJob.find()
      .populate('customer', 'name email phone')
      .populate({ path: 'originalBooking', populate: { path: 'service' } })
      .populate('resultingBooking')
      .sort({ reportedAt: -1 });

    // Surface the original service report's pre-existing-issue flag right here -
    // this is exactly what lets admin tell a legitimate (workmanship-caused) claim
    // apart from a pre-existing condition, without hunting down the report separately.
    const enriched = await Promise.all(backJobs.map(async (bj) => {
      const obj = bj.toObject();
      const originalReport = await Report.findOne({ bookingId: bj.originalBookingId })
        .select('preExistingIssue');
      obj.originalReportPreExistingIssue = originalReport?.preExistingIssue || null;
      obj.warranty = bj.originalBooking ? getWarrantyStatus(bj.originalBooking) : null;
      return obj;
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check whether a specific booking already has a back job report (and its
// outcome) - lets the customer's booking details page show the existing claim
// instead of the report form, and blocks duplicate submissions client-side too.
router.get('/booking/:bookingId', auth, async (req, res) => {
  try {
    const backJob = await BackJob.findOne({ originalBookingId: req.params.bookingId })
      .populate('resultingBooking');

    // No claim on a booking is the normal case, not an error: 200 with null, so a booking page that asks does not log a failed request.
    if (!backJob) return res.json(null);

    if (req.userRole !== ROLE.ADMIN && backJob.customer !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // the customer sees the claim without who reviewed it, and the free visit through the customer whitelist
    res.json(req.userRole === ROLE.ADMIN ? backJob : toCustomerBackJob(backJob));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: mark a Not Covered claim as reviewed, once it's been handled manually
// (the paper doesn't specify what "handled" means here - outside warranty could
// become a new paid booking, or something else entirely; this route only records
// that admin has looked at it, it doesn't automate any outcome).
router.patch('/:backJobId/review', auth, auditSpecs.backJobReview, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const backJob = await BackJob.findOne({ backJobId: req.params.backJobId });
    if (!backJob) return res.status(404).json({ message: 'Back job report not found' });

    if (backJob.status !== BACK_JOB_STATUS.NOT_COVERED) {
      return res.status(400).json({ message: 'Only a Not Covered claim can be marked reviewed.' });
    }

    backJob.status = BACK_JOB_STATUS.REVIEWED;
    backJob.isOpen = false;
    backJob.reviewedAt = new Date();
    backJob.reviewedBy = req.userId;
    await backJob.save();

    // the customer hears the decision; a notification problem never undoes it
    try {
      await sendNotification(
        backJob.customer,
        NOTIFICATION_TYPE.BACKJOB_DECIDED,
        `Our team reviewed your claim ${backJob.backJobId} for booking ${backJob.originalBookingId}. It was outside the warranty period, so it is not covered. Contact us if you would like to arrange a paid visit.`,
        { booking: { _id: backJob.originalBooking, bookingId: backJob.originalBookingId } }
      );
    } catch (err) {
      console.error('Could not notify the customer about a reviewed claim:', err);
    }

    res.json(backJob);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
