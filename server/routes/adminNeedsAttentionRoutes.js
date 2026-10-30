// GET /api/admin/needs-attention: what the admin has to act on, in one place (utils/needsAttention.js has the rules). Admin only. It only reads:
// no booking, payment, refund or claim is changed, nothing is stored, and nothing is cached, so every answer is live.
//
// Database queries per request (after the login check): 4.
//   1. Booking.find   one query for every booking that is Pending, Approved or In Progress (index { status, date }), plus the cancelled ones
//                     that still wait on a refund or on a payment check
//   2. BackJob.find   the open claims that are Not Covered (index { status })
//   3. Service.find   the services of the Approved bookings dated today or tomorrow, to know how many technicians each needs
//   4. User.find      the names of the customers on the items that are shown (at most 3 groups of 5 items, or every item with ?all=1), never one query per item
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const Service = require('../models/Service');
const User = require('../models/User');
const { ROLE } = require('../constants/roles');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { REFUND_STATUS } = require('../constants/refundStatus');
const { BACK_JOB_STATUS } = require('../constants/backJobStatus');
const { TODAY_WINDOW_DAYS } = require('../constants/needsAttention');
const { buildGroups, withNames, keptCustomerIds } = require('../utils/needsAttention');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = require('../utils/extensionDays');
const { sendRouteError } = require('../utils/routeErrors');

router.use(auth, (req, res, next) => (req.userRole === ROLE.ADMIN ? next() : res.status(403).json({ message: 'Forbidden' })));

const BOOKING_FIELDS = [
  'bookingId', 'customer', 'service', 'status', 'date', 'time', 'assignments', 'technician', 'createdAt', 'updatedAt',
  'paymentStatus', 'balancePaymentStatus', 'paymentCheckAfterCancel', 'refund.status', 'refund.requestedAt', 'refund.paymentUnverified',
  'units.supplied.source', 'units.supplied.status', 'units.supplied.chosenAt', 'unitDecline.reason', 'unitDecline.declinedAt',
  // what the down payment rules need to tell "waiting for the customer" from "the owner has to confirm the unit" (utils/paymentDue.js)
  'downPaymentPercent', 'downPaymentPaidAmount', 'clientSuppliedUnit', 'unitConfirmedAt', 'pricingVersion', 'isCommercial', 'taxInclusive',
  'units.type', 'units.quantity', 'units.supplied.price', 'priceSnapshot', 'scopeLines', 'distanceAdjustment', 'mobilizationFee', 'promo', 'balancePaid',
  'discount.status', 'discount.requestedAt', 'discount.percent', 'discount.dpPaidBeforeApproval', 'extensionRequest.status', 'extensionRequest.requestedAt', 'disruption.status', 'disruption.reportedAt',
].join(' ');

router.get('/needs-attention', async (req, res) => {
  try {
    const now = new Date();
    const todayKey = manilaTodayKey(now);
    const windowEnd = addDays(todayKey, TODAY_WINDOW_DAYS);

    const [bookings, backJobs] = await Promise.all([
      Booking.find({
        $or: [
          { status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS] } },
          { status: BOOKING_STATUS.CANCELLED, $or: [{ 'refund.status': REFUND_STATUS.PENDING }, { paymentCheckAfterCancel: true }] },
        ],
      }).select(BOOKING_FIELDS).lean(),
      BackJob.find({ isOpen: true, status: BACK_JOB_STATUS.NOT_COVERED }).select('originalBookingId customer reportedAt status isOpen').lean(),
    ]);

    // the services of the Approved bookings in the window (whose staffing is looked at) and of the Pending ones (whose payment rules need the price)
    const serviceIds = [...new Set(bookings
      .filter((b) => b.status === BOOKING_STATUS.PENDING || (b.status === BOOKING_STATUS.APPROVED && b.date && b.date <= windowEnd))
      .map((b) => String(b.service)))];
    const services = serviceIds.length > 0 ? await Service.find({ _id: { $in: serviceIds } }).select('name serviceType minTechnicians price unitTypePricing').lean() : [];
    const servicesById = new Map(services.map((s) => [String(s._id), s]));

    // ?all=1 lifts only the cap on items per group (the notifications page merges and rolls them up); counts, order and rules stay the same
    const groups = buildGroups({ bookings, backJobs, servicesById, now }, req.query.all === '1' ? Infinity : undefined);
    const ids = keptCustomerIds(groups);
    const customers = ids.length > 0 ? await User.find({ _id: { $in: ids } }).select('name').lean() : [];
    const named = withNames(groups, new Map(customers.map((c) => [String(c._id), c.name])));

    res.json({
      generatedAt: now.toISOString(),
      today: todayKey,
      total: named.today.count + named.decision.count,
      groups: named,
    });
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;
