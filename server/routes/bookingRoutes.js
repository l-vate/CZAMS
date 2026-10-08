const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { ROLE } = require('../constants/roles');
const { REFUND_STATUS } = require('../constants/refundStatus');
const { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const { BOOKING_STATUS, BOOKING_STATUS_VALUES } = require('../constants/bookingStatus');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const path = require('path');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');
const { getWarrantyStatus } = require('../utils/warranty');
const { sendNotification, notifyAdmins } = require('../utils/notifications');
const Report = require('../models/Report');
const {
  getBookingBasePrice, getBookingUnitsSubtotal, getBookingGrossUnitsSubtotal, getBookingTotalQuantity,
  getSeniorDiscountAmount, getAppliedDiscount,
} = require('../utils/pricing');
const Promo = require('../models/Promo');
const { pickBestPromo } = require('../utils/promos');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { isWithinServiceArea } = require('../utils/serviceArea');
const { runBookingStatusCheck } = require('../jobs/bookingStatusJob');
const { getOrCreateSettings } = require('../utils/paymentSettings');
const Team = require('../models/Team');
const { proposeAssignment } = require('../utils/autoAssign');
const { nextQueueRank, reorder: reorderQueue, getQueue } = require('../utils/queue');
const { generateBookingId, createWithUniqueBookingId, BookingIdExhaustedError } = require('../utils/bookingId');
const { invalid, sendProblem } = require('../utils/validation');
const {
  ASSIGNMENT_POPULATE, getMemberIds, getLeadIds, getRoleFor, getMinTechnicians,
  memberFilter, findConflictingBooking, getBusyTechnicianIds,
} = require('../utils/assignments');
const { resolveClassification } = require('../utils/classification');

const { TIME_BLOCKS } = require('../utils/timeBlocks');

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
    const dir = path.join(__dirname, '../uploads/proofs');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // Unguessable name: /uploads is served statically, so the filename is the only
  // thing protecting a payment proof, refund proof, or purchase proof from being
  // found by guessing a booking ID.
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
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

// A phone number the technician can actually call: digits plus the usual
// separators, 7 to 15 digits. Returns the trimmed value, or null if invalid.
function normalizeContactNumber(raw) {
  const value = String(raw || '').trim();
  if (!/^\+?[0-9\s\-()]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? value : null;
}

// What an admin may do to a booking's status: null when allowed, otherwise { status, message }.
// Cancelling is allowed here and handled (with its refund) further down.
function validateAdminStatusChange(current, requested) {
  if (!requested || requested === current) return null;
  if (requested === BOOKING_STATUS.APPROVED) {
    return current === BOOKING_STATUS.PENDING ? null : invalid('Only a pending booking can be approved.');
  }
  if (requested === BOOKING_STATUS.CANCELLED) return null;
  if (requested === BOOKING_STATUS.IN_PROGRESS || requested === BOOKING_STATUS.COMPLETED) {
    return invalid('A booking becomes In Progress automatically when its time block starts, and Completed when the technician submits the service report. It cannot be set by hand.');
  }
  return invalid('A booking cannot be moved back to Pending.');
}

// One notification to every technician on the booking (every member of every assigned team).
async function notifyMembers(booking, type, message) {
  await Promise.all(getMemberIds(booking).map((id) => sendNotification(id, type, message, { booking })));
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
// The down payment in pesos, from the booking's totals right now (units minus any applied discount,
// times the down payment percent).
function computeDownPaymentAmount(booking) {
  return Math.round(getBookingUnitsSubtotal(booking) * ((booking.downPaymentPercent || 0) / 100));
}

function openRefundIfEligible(booking) {
  const hasDownPaymentOnFile =
    booking.downPaymentPercent > 0 &&
    ![PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.REJECTED].includes(booking.paymentStatus);

  if (!hasDownPaymentOnFile) return;

  // What the customer actually paid when they submitted it, else (older bookings) the current figure.
  const downPaymentAmount = typeof booking.downPaymentPaidAmount === 'number'
    ? booking.downPaymentPaidAmount
    : computeDownPaymentAmount(booking);
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
// 1b. PUBLIC ROUTES (no auth - Landing Page Module search)
// ============================================

// Company-wide feedback aggregate for the landing page search popup. When a visitor's
// search matches a technician we deliberately show this instead of that individual's
// own rating/reviews (small field team; no public per-technician profile). All-time,
// across every completed booking with feedback on file, regardless of which
// technician was assigned. The recent review texts carry no customer or technician
// name. Registered as a two-segment path (not just "/:bookingId") so it can never be
// shadowed by the single-segment booking-detail route below.
router.get('/public/feedback-summary', async (req, res) => {
  try {
    const hasRating = { 'feedback.rating': { $exists: true, $ne: null } };

    const [result] = await Booking.aggregate([
      { $match: hasRating },
      { $group: { _id: null, averageRating: { $avg: '$feedback.rating' }, totalReviews: { $sum: 1 } } },
    ]);

    const recent = await Booking.find({ ...hasRating, 'feedback.text': { $exists: true, $nin: [null, ''] } })
      .sort({ 'feedback.createdAt': -1 })
      .limit(3)
      .select('feedback');

    res.json({
      averageRating: result ? Math.round(result.averageRating * 10) / 10 : null,
      totalReviews: result ? result.totalReviews : 0,
      recentReviews: recent.map((bk) => ({
        rating: bk.feedback.rating,
        text: bk.feedback.text,
        createdAt: bk.feedback.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: manually run the Approved -> In Progress auto-transition check on
// demand (the same daily-midnight cron does this automatically) - useful for
// testing without waiting for the scheduled run.
router.post('/status-check/run', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const result = await runBookingStatusCheck();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin-only per-technician reviews, including the customer's name, for the
// Performance Review modal (Manage Accounts). Nothing per-technician is public:
// the landing page only gets the company-wide aggregate (/public/feedback-summary).
router.get('/technicians/:id/feedback', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // A job counts for every technician on it (the lead and the helper both get its feedback).
    const bookings = await Booking.find({
      ...memberFilter(req.params.id),
      'feedback.rating': { $exists: true, $ne: null },
    })
      .populate('customer', 'name')
      .sort({ 'feedback.createdAt': -1 })
      .select('feedback customer');

    const reviews = bookings.map((b) => ({
      name: b.customer?.name || 'Customer',
      rating: b.feedback.rating,
      text: b.feedback.text || null,
      // Older feedback docs predate the `createdAt` field and only have the
      // earlier field name `submittedAt` - same fallback as the staff dashboard.
      createdAt: b.feedback.createdAt || b.feedback.submittedAt,
    }));

    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// 2. CUSTOMER ROUTES (Booking Management)
// ============================================

// Create a booking (initial submission with proof). Normally the caller is the
// customer themselves; an admin creating a walk-in/phone-in booking on someone
// else's behalf may pass `customer` to book it under that customer's account
// instead - only admins can do this, everyone else always books under their own id.
router.post('/', auth, (req, res, next) => {
  req.generatedBookingId = generateBookingId();
  next();
}, upload.fields([{ name: 'proof', maxCount: 1 }, { name: 'discountId', maxCount: 1 }]), async (req, res) => {
  try {
    const {
      service, units: unitsRaw, problemDescription,
      date, time, technician, address,
      downPaymentPercent, paymentMode, paymentMode2,
      customer, clientSuppliedUnit, unitWaiverAcknowledged, unitWaiverName, contactNumber,
      lastCleanedOver6MonthsAgo, isActivelyLeaking,
      poNumber, paymentTermsDays, discountType,
    } = req.body;

    if (paymentTermsDays !== undefined && paymentTermsDays !== '' && paymentTermsDays !== null) {
      const days = Number(paymentTermsDays);
      if (!Number.isInteger(days) || days < 7 || days > 10) {
        return res.status(400).json({ message: 'Payment terms must be between 7 and 10 days.' });
      }
    }

    if (!isDateAllowed(date)) {
      return res.status(400).json({
        message: 'Selected date must be at least 3 days from today.'
      });
    }

    if (!TIME_BLOCKS.includes(time)) {
      return res.status(400).json({ message: 'Time must be Morning or Afternoon.' });
    }

    const cleanContactNumber = normalizeContactNumber(contactNumber);
    if (!cleanContactNumber) {
      return res.status(400).json({ message: 'A valid contact number is required (7 to 15 digits).' });
    }

    if (technician) {
      const conflict = await findConflictingBooking(technician, date, time);
      if (conflict) {
        return res.status(400).json({
          message: `This technician is already booked ${date} (${time}). Choose a different technician or time.`
        });
      }
    }

    // Multi-Unit Booking Redesign: `units` arrives as a JSON string, same reason
    // `proof` is a file rather than JSON - this is a multipart/form-data request,
    // which can't carry a nested array as a plain field the way a JSON body could.
    let units;
    try {
      units = JSON.parse(unitsRaw || '[]');
    } catch {
      return res.status(400).json({ message: 'Invalid unit list.' });
    }
    if (!Array.isArray(units) || units.length === 0) {
      return res.status(400).json({ message: 'At least one unit is required.' });
    }
    if (units.some((u) => !u.type || !Number.isFinite(Number(u.quantity)) || Number(u.quantity) < 1)) {
      return res.status(400).json({ message: 'Each unit needs a type and a quantity of at least 1.' });
    }
    units = units.map((u) => ({
      type: u.type,
      quantity: Number(u.quantity),
      brandModel: u.brandModel || '',
    }));

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
    let bookingCustomer = null;
    if (req.userRole === ROLE.ADMIN && customer) {
      bookingCustomer = await User.findById(customer);
      if (!bookingCustomer) {
        return res.status(400).json({ message: 'Selected customer account not found.' });
      }
      bookingCustomerId = customer;
      isAdminWalkIn = true;
    } else {
      bookingCustomer = await User.findById(bookingCustomerId);
    }

    // Commercial Client Procedures: PO number and payment-terms billing only make
    // sense for a Commercial client - silently ignored for a Residential one
    // rather than erroring, since the frontend only shows these fields when
    // isCommercial anyway.
    const isCommercial = bookingCustomer?.clientType === 'Commercial';

    // Down payment and payment modes must come from what admin has configured in
    // Payment Settings. 0% is a perk, not a configured option: only a Return
    // customer, or a Commercial booking billed on payment terms, may use it.
    const paymentSettings = await getOrCreateSettings();
    const allowedPercents = paymentSettings.downPaymentPercentages.map(Number);
    const allowedModes = paymentSettings.paymentMethods.map((m) => m.name);
    const dpPercent = downPaymentPercent === undefined || downPaymentPercent === '' ? NaN : Number(downPaymentPercent);

    if (!Number.isFinite(dpPercent)) {
      return res.status(400).json({ message: 'A down payment option is required.' });
    }
    if (!allowedPercents.includes(dpPercent)) {
      const hasPaymentTerms = isCommercial && !!paymentTermsDays;
      const zeroAllowed = dpPercent === 0 &&
        (hasPaymentTerms || (await resolveClassification(bookingCustomer)) === 'Return');
      if (!zeroAllowed) {
        return res.status(400).json({
          message: dpPercent === 0
            ? 'No down payment is only available to return customers or commercial clients on payment terms.'
            : `Down payment must be one of: ${allowedPercents.join('%, ')}%.`
        });
      }
    }
    if (dpPercent > 0 && !allowedModes.includes(paymentMode)) {
      return res.status(400).json({ message: 'Choose a valid payment mode.' });
    }
    if (paymentMode && !allowedModes.includes(paymentMode)) {
      return res.status(400).json({ message: 'Choose a valid payment mode.' });
    }
    if (paymentMode2 && !allowedModes.includes(paymentMode2)) {
      return res.status(400).json({ message: 'Choose a valid payment mode for the second payment.' });
    }

    const proofFile = req.files?.proof?.[0] ? `/uploads/proofs/${req.files.proof[0].filename}` : undefined;

    // Senior Citizen / PWD discount request. A customer must attach a photo of a valid
    // ID and the discount stays Pending until an admin approves it. An admin booking on
    // someone's behalf (walk-in) has seen the ID in person: it is approved on the spot
    // and the ID upload is optional.
    const discountIdFile = req.files?.discountId?.[0];
    const discountIdPath = discountIdFile ? `/uploads/proofs/${discountIdFile.filename}` : undefined;
    const isDiscountRequested = discountType === 'Senior' || discountType === 'PWD';
    if (discountType && !isDiscountRequested) {
      return res.status(400).json({ message: 'Choose either Senior Citizen or PWD for the discount.' });
    }
    if (discountIdFile && !isDiscountRequested) {
      return res.status(400).json({ message: 'Choose Senior Citizen or PWD to go with the ID you uploaded.' });
    }
    if (isDiscountRequested && !isAdminWalkIn && !discountIdFile) {
      return res.status(400).json({ message: 'Upload a photo of a valid ID to request the Senior Citizen / PWD discount.' });
    }
    const now = new Date();
    let discount;
    if (isDiscountRequested) {
      discount = isAdminWalkIn
        ? {
            type: discountType, idFile: discountIdPath, status: 'Approved',
            percent: Number(paymentSettings.seniorPwdDiscountPercent ?? 20),
            dpPaidBeforeApproval: 0, requestedAt: now, reviewedAt: now, reviewedBy: req.userId,
          }
        : { type: discountType, idFile: discountIdPath, status: 'Pending', requestedAt: now };
    }

    // A walk-in booking's admin is physically/verbally confirming payment on the
    // spot, so with no proof to check it's marked paid immediately instead of
    // sitting in the Payments queue looking like an unresolved to-verify item with
    // nothing to review. If the admin did attach proof (e.g. a GCash screenshot),
    // it still goes through the normal to_verify review like any other booking.
    // A 0% down payment (the Customer Classification return-customer perk) is the
    // one case where nothing was actually collected, so it stays 'Unpaid' either way.
    let paymentStatus;
    if (proofFile) {
      paymentStatus = PAYMENT_STATUS.TO_VERIFY;
    } else if (isAdminWalkIn && Number(downPaymentPercent) > 0) {
      paymentStatus = Number(downPaymentPercent) >= 100 ? PAYMENT_STATUS.FULLY_PAID : PAYMENT_STATUS.PARTIALLY_PAID;
    } else {
      paymentStatus = PAYMENT_STATUS.UNPAID;
    }

    const withinServiceArea = isWithinServiceArea(address);

    // Guard against stale cleaning-tier answers riding along onto a booking for
    // a different (or no longer Cleaning) service - the client also resets these
    // on service switch, but this is the actual enforcement point.
    const selectedService = await Service.findById(service).select('serviceType');
    const isCleaningService = selectedService?.serviceType === SERVICE_TYPE.CLEANING;

    const queueRank = await nextQueueRank(); // last in line: first come, first served
    const booking = await createWithUniqueBookingId((bookingId) => Booking.create({
      bookingId,
      queueRank,
      customer: bookingCustomerId,
      service, units, problemDescription,
      date, time, requestedTechnician: technician || undefined, address, contactNumber: cleanContactNumber,
      downPaymentPercent, paymentMode, paymentMode2,
      paymentStatus, proofFile,
      clientSuppliedUnit: isClientSuppliedUnit,
      unitWaiver: isClientSuppliedUnit ? {
        acknowledged: true,
        customerName: unitWaiverName.trim(),
        acknowledgedAt: new Date(),
      } : undefined,
      serviceAreaCheck: { withinArea: withinServiceArea, checkedAt: new Date() },
      cleaningTierAnswers: (isCleaningService && (lastCleanedOver6MonthsAgo !== undefined || isActivelyLeaking !== undefined)) ? {
        lastCleanedOver6MonthsAgo: lastCleanedOver6MonthsAgo === 'true' || lastCleanedOver6MonthsAgo === true,
        isActivelyLeaking: isActivelyLeaking === 'true' || isActivelyLeaking === true,
      } : undefined,
      isCommercial,
      poNumber: isCommercial && poNumber ? String(poNumber).trim() : null,
      paymentTermsDays: isCommercial && paymentTermsDays ? Number(paymentTermsDays) : null,
      ...(discount ? { discount } : {}),
    }), { firstId: req.generatedBookingId });

    const populated = await booking.populate('service');

    // The discount amount needs the populated service for per-unit-type pricing, so it
    // is snapshotted here for an immediately approved walk-in discount.
    // Promotions: if the order qualifies for an active promo, the best one (largest discount)
    // is applied automatically and copied onto the booking, so editing or deleting the promo
    // later never changes it. Back-job visits never get one (they are free).
    const today = manilaTodayKey();
    const activePromos = await Promo.find({ isActive: true, startDate: { $lte: today }, endDate: { $gte: today } }).sort({ createdAt: 1 });
    const bestPromo = pickBestPromo(activePromos, {
      serviceId: service,
      totalQuantity: getBookingTotalQuantity(populated),
      grossSubtotal: getBookingGrossUnitsSubtotal(populated),
    }, today);
    if (bestPromo) {
      populated.promo = {
        promoId: String(bestPromo.promo._id),
        name: bestPromo.promo.name,
        discountType: bestPromo.promo.discountType,
        discountValue: bestPromo.promo.discountValue,
        amount: bestPromo.amount,
      };
    }

    const discountApprovedNow = populated.discount?.status === BOOKING_STATUS.APPROVED;
    if (discountApprovedNow) {
      populated.discount.amount = getSeniorDiscountAmount(populated);
    }

    // 12% VAT, additive on top of the VAT-exclusive base price (after any approved
    // discount) - computed after populate since getBookingBasePrice needs the populated
    // service for per-unit-type pricing.
    if (isCommercial) {
      const basePrice = getBookingBasePrice(populated);
      populated.vatAmount = Math.round(basePrice * 0.12);
    }
    // Remember what the down payment came to now, while the totals are what the customer saw.
    const downPaymentOnFile = populated.downPaymentPercent > 0
      && [PAYMENT_STATUS.TO_VERIFY, PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(populated.paymentStatus);
    if (downPaymentOnFile) populated.downPaymentPaidAmount = computeDownPaymentAmount(populated);
    if (isCommercial || discountApprovedNow || bestPromo || downPaymentOnFile) {
      await populated.save();
    }

    if (populated.discount?.status === 'Pending') {
      await notifyAdmins(
        NOTIFICATION_TYPE.DISCOUNT_REQUESTED,
        `Booking ${populated.bookingId}: the customer requested the ${populated.discount.type === 'PWD' ? 'PWD' : 'Senior Citizen'} discount. Review the uploaded ID.`,
        { booking: populated }
      );
    }

    await sendNotification(
      bookingCustomerId,
      NOTIFICATION_TYPE.BOOKING_CREATED,
      `Your booking ${populated.bookingId} for ${populated.service?.name || 'a service'} has been submitted and is pending confirmation.`,
      { booking: populated }
    );

    res.status(201).json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    if (err instanceof BookingIdExhaustedError) return res.status(500).json({ message: err.message });
    res.status(500).json({ message: 'Server error' });
  }
});

// Get logged-in user's bookings (customer side)
router.get('/mine', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ customer: req.userId })
      .populate('service')
      .populate('technician', 'name').populate(ASSIGNMENT_POPULATE)
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

// Get busy technicians for a specific date. Must stay registered before
// GET /:bookingId below - Express matches in registration order, so any
// single-segment GET path declared after it is swallowed as a bookingId lookup
// (this route used to sit after it and always 404'd "Booking not found").
router.get('/busy-technicians', auth, async (req, res) => {
  try {
    const { date, time } = req.query;
    if (!date) return res.status(400).json({ message: 'Date is required' });

    // Optional `time` narrows to that Morning/Afternoon block specifically,
    // matching the same date+time granularity findConflictingBooking enforces -
    // without it, this falls back to the coarser whole-day check (still useful
    // for the admin reassignment view, which doesn't always have a time to filter by).
    // Every member of every assigned team counts as busy, not just a booking's one technician.
    const busyTechIds = await getBusyTechnicianIds(date, time, req.query.excludeBookingId);

    res.json({ busyTechIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: the Pending queue in order, each with its position and a capacity hint. Registered
// before GET /:bookingId so it is not read as a booking id.
router.get('/queue', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const queue = await getQueue();
    res.json(queue.map((item) => ({ ...item, booking: withWarranty(item.booking) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: per-technician workload for the dashboard. Upcoming = Approved or In
// Progress with a date from today onward; Today = the subset dated today. Every
// active technician is listed, including those with nothing scheduled. Must stay
// registered before GET /:bookingId, which would otherwise swallow this path.
router.get('/technician-workload', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const today = todayDateString();
    const technicians = await User.find({ role: ROLE.STAFF, isActive: true }).select('name').sort({ name: 1 });
    const bookings = await Booking.find({
      ...memberFilter(technicians.map((t) => t._id)),
      status: { $in: [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS] },
      date: { $gte: today },
    }).select('technician assignments date');

    const rows = technicians.map((t) => {
      const mine = bookings.filter((b) => getMemberIds(b).includes(t._id));
      return {
        technicianId: t._id,
        name: t.name,
        upcoming: mine.length,
        today: mine.filter((b) => b.date === today).length,
      };
    });

    res.json(rows);
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
    }).populate('service').populate('technician', 'name').populate(ASSIGNMENT_POPULATE);

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
// refund request (Cancellation, Rescheduling, and Refund Module) - same-day
// cancellations get flagged so the dispatch/transportation cost can be deducted
// before an admin processes it; pre-service cancellations refund in full.
router.patch('/:bookingId/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      customer: req.userId,
    }).populate('service');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.status === BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ message: 'This booking is already in progress and can no longer be cancelled online. Please contact us directly.' });
    }
    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED].includes(booking.status)) {
      return res.status(400).json({ message: 'This booking can no longer be cancelled.' });
    }

    openRefundIfEligible(booking);

    booking.status = BOOKING_STATUS.CANCELLED;
    await booking.save();

    if (booking.refund?.status === REFUND_STATUS.PENDING) {
      await notifyAdmins(
        NOTIFICATION_TYPE.REFUND_REQUESTED,
        `Booking ${booking.bookingId} was cancelled by the customer and a refund request is waiting for review${booking.refund.isSameDay ? ' (same-day cancellation, deduction needed)' : ''}.`,
        { booking }
      );
    }

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
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

    const booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.paymentStatus = PAYMENT_STATUS.TO_VERIFY;
    if (proofFile) booking.proofFile = proofFile;
    // The amount submitted now, from the totals as they are now.
    if (booking.downPaymentPercent > 0) booking.downPaymentPaidAmount = computeDownPaymentAmount(booking);
    await booking.save();

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

    const updateData = { balancePaymentStatus: BALANCE_PAYMENT_STATUS.TO_VERIFY };
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

// Admin: approve a pending Senior Citizen / PWD discount. The rate comes from Payment
// Settings at this moment and is frozen on the booking. Nothing is refunded
// automatically: if a down payment was already verified, it is recorded so the balance
// is simply lower (see getPaymentBreakdown in utils/pricing.js).
router.patch('/:bookingId/discount/approve', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.discount?.status !== 'Pending') {
      return res.status(400).json({ message: 'There is no pending discount request on this booking.' });
    }
    if (booking.status === BOOKING_STATUS.CANCELLED) {
      return res.status(400).json({ message: 'This booking is cancelled.' });
    }

    const settings = await getOrCreateSettings();
    const percent = Number(settings.seniorPwdDiscountPercent ?? 20);

    // Computed before the discount is switched on, so this is the full-price down payment.
    const downPaymentVerified = [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus);
    const dpPaid = downPaymentVerified
      ? Math.round(getBookingUnitsSubtotal(booking) * ((booking.downPaymentPercent || 0) / 100))
      : 0;

    booking.discount.status = 'Approved';
    booking.discount.percent = percent;
    booking.discount.dpPaidBeforeApproval = dpPaid;
    booking.discount.rejectionReason = undefined;
    booking.discount.reviewedAt = new Date();
    booking.discount.reviewedBy = req.userId;
    booking.discount.amount = getSeniorDiscountAmount(booking);

    if (booking.isCommercial) {
      booking.vatAmount = Math.round(getBookingUnitsSubtotal(booking) * 0.12);
    }

    await booking.save();

    // A promo and a Senior/PWD discount do not stack: the larger one applies.
    const applied = getAppliedDiscount(booking);
    const kindName = booking.discount.type === 'PWD' ? 'PWD' : 'Senior Citizen';
    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.DISCOUNT_APPROVED,
      applied.kind === 'promo'
        ? `Your ${kindName} discount for booking ${booking.bookingId} was approved (${percent}%), but the promo "${booking.promo.name}" already gives you a larger discount, so the promo applies and your total is unchanged.`
        : `Your ${kindName} discount for booking ${booking.bookingId} was approved: ${percent}% off, a saving of ₱${booking.discount.amount.toLocaleString()}.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: reject a pending discount request. A short reason is required and is shown to
// the customer. The booking total stays exactly as it was.
router.patch('/:bookingId/discount/reject', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const reason = (req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ message: 'Please give a short reason for rejecting the discount.' });
    }
    if (reason.length > 200) {
      return res.status(400).json({ message: 'Keep the reason to 200 characters or fewer.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.discount?.status !== 'Pending') {
      return res.status(400).json({ message: 'There is no pending discount request on this booking.' });
    }

    booking.discount.status = 'Rejected';
    booking.discount.rejectionReason = reason;
    booking.discount.reviewedAt = new Date();
    booking.discount.reviewedBy = req.userId;
    await booking.save();

    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.DISCOUNT_REJECTED,
      `Your discount request for booking ${booking.bookingId} was not approved: ${reason}. Your total is unchanged.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: move a Pending booking in the queue. Body: { action: 'up' | 'down' | 'top' }.
// Answers with the whole queue so the screen can replace its list in one step.
router.patch('/:bookingId/queue', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const result = await reorderQueue(req.params.bookingId, req.body.action);
    if (result.error) return res.status(400).json({ message: result.error });

    const queue = await getQueue();
    res.json(queue.map((item) => ({ ...item, booking: withWarranty(item.booking) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: upload proof a CZA-supplied unit was actually purchased through CZA -
// backs a future 5yr/1yr Unit Warranty claim, mirrors the client-supplied-unit
// waiver's role but for the opposite case. Admin-side (not the customer's), since
// CZA is the one that made the sale and holds the record of it.
router.patch('/:bookingId/unit-purchase-proof', auth, upload.single('proof'), async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'A proof-of-purchase file is required.' });
    }

    const booking = await Booking.findOneAndUpdate(
      { bookingId: req.params.bookingId },
      { unitPurchaseProof: `/uploads/proofs/${req.file.filename}` },
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

    if (!TIME_BLOCKS.includes(time)) {
      return res.status(400).json({ message: 'Time must be Morning or Afternoon.' });
    }

    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId, 
      customer: req.userId 
    });
    
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    let needsAdminApproval = false;

    if (booking.status === BOOKING_STATUS.PENDING) {
      const conflict = await findConflictingBooking(getMemberIds(booking), date, time, booking.bookingId);
      if (conflict) {
        return res.status(409).json({
          message: 'The assigned technician is not available at that date and time. Please choose a different date or time.'
        });
      }
      booking.date = date;
      booking.time = time;
      booking.rescheduleRequest = { 
        requestedDate: null, 
        requestedTime: null, 
        status: 'None' 
      };
    } else if ([BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
      booking.rescheduleRequest = { 
        requestedDate: date, 
        requestedTime: time, 
        status: 'Pending' 
      };
      needsAdminApproval = true;
    } else {
      return res.status(400).json({ 
        message: 'This booking can no longer be rescheduled.' 
      });
    }

    await booking.save();

    if (needsAdminApproval) {
      await notifyAdmins(
        NOTIFICATION_TYPE.RESCHEDULE_REQUESTED,
        `Booking ${booking.bookingId}: the customer asked to move the service to ${date}, ${time}. Approval needed.`,
        { booking }
      );
    }

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
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

    if (booking.status !== BOOKING_STATUS.COMPLETED) {
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
      ...ASSIGNMENT_POPULATE,
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
    // Every job where this technician is the lead or the helper, labelled with their role.
    const jobs = await Booking.find(memberFilter(req.userId))
      .populate('service')
      .populate('customer', 'name phone')
      .populate('technician', 'name')
      .populate(ASSIGNMENT_POPULATE)
      .sort({ date: -1 });
    res.json(jobs.map((j) => ({ ...j.toObject(), myRole: getRoleFor(j, req.userId) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get dashboard stats for the logged-in technician
router.get('/technician/mine/stats', auth, async (req, res) => {
  try {
    // Jobs count for the lead and the helper alike.
    const jobs = await Booking.find(memberFilter(req.userId))
      .populate('customer', 'name');
    
    const ongoing = jobs.filter(j => [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(j.status)).length;
    const completed = jobs.filter(j => j.status === BOOKING_STATUS.COMPLETED).length;
    // A completed job is waiting on a report when no Report document exists for it
    // (reports live in their own collection; booking.report is a legacy field that
    // is never filled any more).
    // Only the lead files the report, so only the lead's jobs wait on one.
    const leadJobs = jobs.filter(j => getRoleFor(j, req.userId) === 'Lead');
    const completedIds = leadJobs.filter(j => j.status === BOOKING_STATUS.COMPLETED).map(j => j.bookingId);
    const reportedIds = new Set(await Report.find({ bookingId: { $in: completedIds } }).distinct('bookingId'));
    const completedWithoutReport = completedIds.filter(id => !reportedIds.has(id)).length;
    // An In Progress job is waiting for its report (submitting it is what completes the job).
    const pendingReports = leadJobs.filter(j => j.status === BOOKING_STATUS.IN_PROGRESS).length + completedWithoutReport;
    const feedbacks = jobs
      .filter(j => j.feedback?.text)
      .map(j => ({
        name: j.customer?.name || 'Customer',
        text: j.feedback.text,
        rating: j.feedback.rating,
        // A handful of older feedback docs were written before the schema had
        // `createdAt` and only have the earlier field name `submittedAt` - not
        // missing data, just an older shape. Fall back to it so those don't
        // show as undated.
        createdAt: j.feedback.createdAt || j.feedback.submittedAt,
      }));

    res.json({ ongoing, completed, pendingReports, feedbacks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Technician: report a disruption on a job that's underway (interrupted, or
// running longer than scheduled). This only records the report - admin reschedules
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

    if (!getMemberIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Not your booking' });
    }
    if (!getLeadIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Only the team lead can report a disruption. Please tell your lead.' });
    }

    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
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

    await notifyAdmins(
      NOTIFICATION_TYPE.DISRUPTION_REPORTED,
      `A technician reported a disruption on booking ${booking.bookingId}: "${reason.trim().slice(0, 100)}". Reschedule needed.`,
      { booking }
    );
    const populated = await booking.populate(['service', 'technician', ...ASSIGNMENT_POPULATE]);
    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Technician: request an extra day to finish a job that's underway - this isn't
// automatic, admin has to approve it (see /:bookingId/extension/approve|deny below).
router.patch('/:bookingId/extension/request', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ message: 'Please describe why more time is needed.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (!getMemberIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Not your booking' });
    }
    if (!getLeadIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Only the team lead can request an extension. Please tell your lead.' });
    }

    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
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

    await notifyAdmins(
      NOTIFICATION_TYPE.EXTENSION_REQUESTED,
      `A technician asked for an extra day on booking ${booking.bookingId}: "${reason.trim().slice(0, 100)}". Approval needed.`,
      { booking }
    );
    const populated = await booking.populate(['service', 'technician', ...ASSIGNMENT_POPULATE]);
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
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const bookings = await Booking.find()
      .populate('service')
      .populate('customer', 'name email phone clientType')
      .populate('technician', 'name').populate(ASSIGNMENT_POPULATE)
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
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId 
    });
    
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    
    if (booking.rescheduleRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending reschedule request.' });
    }

    const conflict = await findConflictingBooking(
      getMemberIds(booking),
      booking.rescheduleRequest.requestedDate,
      booking.rescheduleRequest.requestedTime,
      booking.bookingId
    );
    if (conflict) {
      return res.status(409).json({
        message: `The assigned technician is already booked ${booking.rescheduleRequest.requestedDate} (${booking.rescheduleRequest.requestedTime}) on ${conflict.bookingId}. Reassign the technician or deny this request.`
      });
    }
    
    booking.date = booking.rescheduleRequest.requestedDate;
    booking.time = booking.rescheduleRequest.requestedTime;
    booking.rescheduleRequest = { 
      requestedDate: null, 
      requestedTime: null, 
      status: 'Approved' 
    };
    
    await booking.save();

    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.RESCHEDULE_APPROVED,
      `Your reschedule request for booking ${booking.bookingId} was approved. New schedule: ${booking.date}, ${booking.time}.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: deny a pending reschedule request
router.patch('/:bookingId/reschedule/deny', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ 
      bookingId: req.params.bookingId 
    });
    
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    
    if (booking.rescheduleRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending reschedule request.' });
    }
    
    booking.rescheduleRequest.status = 'Denied';
    await booking.save();

    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.RESCHEDULE_DENIED,
      `Your reschedule request for booking ${booking.bookingId} was not approved. Your original schedule (${booking.date}, ${booking.time}) stands.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Validates a requested assignment and saves it on the booking. Shared by the manual assign
// route and auto-assign so both obey exactly the same rules. `requested` is
// [{ teamId } or { technicianId }]; the first entry is the primary assignment (its lead
// becomes booking.technician), extra entries are additional teams for a big job. It replaces
// the previous assignment, so it is also how a booking is reassigned. Every member of every
// team must be free in the booking's date and time block, and a single technician is only
// allowed for a service that needs just one. Returns { error: { status, message } } or { ok: true }.
async function performAssignment(booking, requested) {
  if ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status)) {
    return { error: { status: 400, message: 'A completed or cancelled booking cannot be reassigned.' } };
  }

  const needed = getMinTechnicians(booking.service);
  const resolved = [];
  const seen = new Set();

  for (const item of requested) {
    let entry;
    if (item.teamId) {
      const team = await Team.findById(item.teamId).populate([{ path: 'lead', select: 'isActive' }, { path: 'helper', select: 'isActive' }]);
      if (!team || !team.isActive) {
        return { error: { status: 400, message: 'That team is not available. Choose an active team.' } };
      }
      if (team.lead.isActive === false || team.helper.isActive === false) {
        return { error: { status: 400, message: `Team "${team.name}" has a deactivated member. Edit the team first.` } };
      }
      entry = { team: team._id, lead: team.lead._id, helper: team.helper._id };
    } else if (item.technicianId) {
      if (needed > 1) {
        return {
          error: { status: 400, message: `${booking.service?.name || 'This service'} needs a team of two. Choose a team, not a single technician.` },
        };
      }
      const tech = await User.findOne({ _id: item.technicianId, role: ROLE.STAFF, isActive: true }).select('_id');
      if (!tech) return { error: { status: 400, message: 'That technician is not available.' } };
      entry = { team: null, lead: tech._id, helper: null };
    } else {
      return { error: { status: 400, message: 'Each assignment needs a team or a technician.' } };
    }

    for (const id of [entry.lead, entry.helper].filter(Boolean)) {
      if (seen.has(id)) {
        return { error: { status: 400, message: 'The same technician cannot be assigned twice to one booking.' } };
      }
      seen.add(id);
    }
    resolved.push(entry);
  }

  // Hard block, per member, so the message can name who is the problem.
  for (const id of seen) {
    const conflict = await findConflictingBooking([id], booking.date, booking.time, booking.bookingId);
    if (conflict) {
      const who = await User.findById(id).select('name');
      return {
        error: {
          status: 409,
          message: `${who?.name || 'A technician'} is already booked ${booking.date} (${booking.time}) on ${conflict.bookingId}. Choose a different team.`,
        },
      };
    }
  }

  const before = new Set(getMemberIds(booking));
  booking.assignments = resolved;
  booking.technician = resolved[0].lead;
  await booking.save();

  // Tell technicians who are newly on the job, and those who were taken off it.
  const after = new Set(getMemberIds(booking));
  const when = `${booking.date}, ${booking.time}`;
  for (const id of after) {
    if (!before.has(id)) {
      const role = getRoleFor(booking, id);
      await sendNotification(id, NOTIFICATION_TYPE.JOB_ASSIGNED, `You were assigned as ${role === 'Helper' ? 'helper' : 'lead'} on booking ${booking.bookingId} (${booking.service?.name || 'service'}) for ${when}.`, { booking });
    }
  }
  for (const id of before) {
    if (!after.has(id)) {
      await sendNotification(id, NOTIFICATION_TYPE.JOB_UNASSIGNED, `You are no longer assigned to booking ${booking.bookingId} (${when}).`, { booking });
    }
  }
  return { ok: true };
}

const ASSIGN_RESPONSE_POPULATE = [
  { path: 'service' },
  { path: 'customer', select: 'name email phone' },
  { path: 'technician', select: 'name' },
  ...ASSIGNMENT_POPULATE,
];

// Admin: assign who does the job. Body: { assignments: [{ teamId } or { technicianId }] }.
router.patch('/:bookingId/assign', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const requested = req.body.assignments;
    if (!Array.isArray(requested) || requested.length === 0) {
      return res.status(400).json({ message: 'Choose at least one team or technician.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const result = await performAssignment(booking, requested);
    if (result.error) return res.status(result.error.status).json({ message: result.error.message });

    const populated = await booking.populate(ASSIGN_RESPONSE_POPULATE);
    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: auto-assign. Picks a team (or a single technician for a service that needs one)
// with the logic in utils/autoAssign.js and assigns it. It only assigns: the admin still
// presses Approve, and can reassign by hand at any time. When nobody is free it assigns
// nothing and answers 409 with up to 3 later dates where someone is.
router.post('/:bookingId/auto-assign', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status)) {
      return res.status(400).json({ message: 'A completed or cancelled booking cannot be assigned.' });
    }
    if (!booking.date || !TIME_BLOCKS.includes(booking.time)) {
      return res.status(400).json({ message: 'This booking has no valid date and time block to assign against.' });
    }

    const proposal = await proposeAssignment(booking);

    if (!proposal.assignment) {
      return res.status(409).json({
        message: proposal.reason,
        suggestedDates: proposal.suggestedDates,
      });
    }

    const result = await performAssignment(booking, [proposal.assignment]);
    if (result.error) return res.status(result.error.status).json({ message: result.error.message });

    const populated = await booking.populate(ASSIGN_RESPONSE_POPULATE);
    res.json({ ...withWarranty(populated), autoAssignNote: proposal.reason });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: assign technician and/or review payment verification
router.patch('/:bookingId/admin-update', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const {
      technician, status, paymentStatus, balancePaymentStatus, balancePaid, technicianInstructions,
      distanceAdjustment, mobilizationFee,
    } = req.body;
    const allowedStatuses = BOOKING_STATUS_VALUES;

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await Booking.findOne({
      bookingId: req.params.bookingId
    }).populate('service');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      return res.status(400).json({
        message: 'This booking is cancelled and can no longer be edited.'
      });
    }

    // Snapshot before any edit so the notifications below fire only on a real change.
    const prev = {
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      balancePaymentStatus: booking.balancePaymentStatus,
    };

    // Status rules. Admin can only approve a Pending booking or cancel one. In Progress
    // and Completed are set by the system alone: In Progress by the status job when the
    // time block starts, Completed when the technician submits the service report.
    const statusProblem = validateAdminStatusChange(booking.status, status);
    if (statusProblem) return sendProblem(res, statusProblem);

    // Technicians are assigned as teams through PATCH /:bookingId/assign, which checks every
    // member for conflicts. This route no longer takes a single technician.
    if (technician !== undefined) {
      return res.status(400).json({ message: 'Assign a team from the assignment panel instead.' });
    }

    // Distance/Mobilization Charges - admin-entered, not system-computed. Tracked
    // separately from the assignment below so we only notify the customer when the
    // saved amount actually changes, not on every admin-update touching this route.
    let chargeChanged = false;
    if (distanceAdjustment !== undefined) {
      const parsed = Number(distanceAdjustment);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'Distance adjustment must be a valid non-negative amount.' });
      }
      if (parsed !== (booking.distanceAdjustment || 0)) chargeChanged = true;
      booking.distanceAdjustment = parsed;
    }
    if (mobilizationFee !== undefined) {
      const parsed = Number(mobilizationFee);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'Mobilization fee must be a valid non-negative amount.' });
      }
      if (parsed !== (booking.mobilizationFee || 0)) chargeChanged = true;
      booking.mobilizationFee = parsed;
    }

    // Pre-service technician instructions (Service Report Module)
    if (technicianInstructions !== undefined) {
      booking.technicianInstructions = technicianInstructions;
    }

    // Staffing rule: approval needs enough technicians for this service.
    if (status === BOOKING_STATUS.APPROVED && prev.status !== BOOKING_STATUS.APPROVED) {
      const assigned = getMemberIds(booking).length;
      const needed = getMinTechnicians(booking.service);
      if (assigned === 0) {
        return res.status(400).json({ message: 'Assign a team before approving.' });
      }
      if (assigned < needed) {
        return res.status(400).json({
          message: `${booking.service?.name || 'This service'} needs at least ${needed} technicians (a team with a lead and a helper). Assign a team before approving.`
        });
      }
    }

    // Admin-initiated cancellation opens the same refund request the customer's own
    // /cancel route would, and is bound by the same rule: only bookings still
    // Pending/Approved/In Progress can be cancelled (never a Completed one).
    if (status === BOOKING_STATUS.CANCELLED) {
      if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
        return res.status(400).json({ message: 'This booking can no longer be cancelled.' });
      }
      openRefundIfEligible(booking);
    }

    // Admin Dashboard + Analytics Module: capture the first time this booking is
    // approved (for the "average response time" metric) - never overwritten on
    // later edits, so re-approving after a status change doesn't reset it.
    if (status === BOOKING_STATUS.APPROVED && !booking.approvedAt) {
      booking.approvedAt = new Date();
    }

    // Update status
    if (status) booking.status = status;

    // ── Down payment track ──
    if (paymentStatus === PAYMENT_STATUS.REJECTED) {
      booking.paymentStatus = PAYMENT_STATUS.REJECTED;
      booking.proofFile = undefined;
    } else if (paymentStatus) {
      booking.paymentStatus = paymentStatus;
    }

    // ── Balance payment track ──
    if (balancePaymentStatus === BALANCE_PAYMENT_STATUS.REJECTED) {
      booking.balancePaymentStatus = BALANCE_PAYMENT_STATUS.REJECTED;
      booking.balanceProofFile = undefined;
    } else if (balancePaymentStatus) {
      booking.balancePaymentStatus = balancePaymentStatus;
    }

    // Handle balance payment
    if (balancePaid !== undefined) {
      booking.balancePaid = balancePaid;
      if (balancePaid) {
        booking.balancePaymentStatus = BALANCE_PAYMENT_STATUS.PAID;
        booking.paymentStatus = PAYMENT_STATUS.FULLY_PAID;
      }
    }

    // Down payment amount on file (see Booking.downPaymentPaidAmount). A rejected proof means no
    // money is on file. A payment an admin marks received with no submission before it (cash at
    // the door) is recorded at the totals of this moment. Bookings paid long ago keep no snapshot.
    if (booking.paymentStatus === PAYMENT_STATUS.REJECTED) {
      booking.downPaymentPaidAmount = undefined;
    } else if (paymentStatus && booking.downPaymentPercent > 0 && typeof booking.downPaymentPaidAmount !== 'number'
      && [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus)) {
      booking.downPaymentPaidAmount = computeDownPaymentAmount(booking);
    }

    await booking.save();

    // Customer notifications for what admin just did. Only on an actual change.
    if (status === BOOKING_STATUS.APPROVED && prev.status !== BOOKING_STATUS.APPROVED) {
      await sendNotification(
        booking.customer,
        NOTIFICATION_TYPE.BOOKING_APPROVED,
        `Your booking ${booking.bookingId} for ${booking.service?.name || 'your service'} has been approved for ${booking.date}, ${booking.time}.`,
        { booking }
      );
    }
    if (status === BOOKING_STATUS.CANCELLED) {
      const refundNote = booking.refund?.status === REFUND_STATUS.PENDING
        ? ' A refund request for your down payment has been opened and is being reviewed.'
        : '';
      await sendNotification(
        booking.customer,
        NOTIFICATION_TYPE.BOOKING_CANCELLED,
        `Your booking ${booking.bookingId} was cancelled by our team.${refundNote}`,
        { booking }
      );
      if (booking.refund?.status === REFUND_STATUS.PENDING) {
        await notifyAdmins(
          NOTIFICATION_TYPE.REFUND_REQUESTED,
          `Booking ${booking.bookingId} was cancelled and a refund request is waiting for review${booking.refund.isSameDay ? ' (same-day cancellation, deduction needed)' : ''}.`,
          { booking }
        );
      }
    }
    const downPaymentNowVerified = [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus)
      && ![PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(prev.paymentStatus);
    const balanceNowVerified = booking.balancePaymentStatus === BALANCE_PAYMENT_STATUS.PAID && prev.balancePaymentStatus !== BALANCE_PAYMENT_STATUS.PAID;
    if (downPaymentNowVerified || balanceNowVerified) {
      await sendNotification(
        booking.customer,
        NOTIFICATION_TYPE.PAYMENT_VERIFIED,
        `Your ${balanceNowVerified && !downPaymentNowVerified ? 'balance ' : ''}payment for booking ${booking.bookingId} has been verified. Thank you!`,
        { booking }
      );
    }
    const downPaymentNowRejected = booking.paymentStatus === PAYMENT_STATUS.REJECTED && prev.paymentStatus !== PAYMENT_STATUS.REJECTED;
    const balanceNowRejected = booking.balancePaymentStatus === BALANCE_PAYMENT_STATUS.REJECTED && prev.balancePaymentStatus !== BALANCE_PAYMENT_STATUS.REJECTED;
    if (downPaymentNowRejected || balanceNowRejected) {
      await sendNotification(
        booking.customer,
        NOTIFICATION_TYPE.PAYMENT_REJECTED,
        `Your ${balanceNowRejected && !downPaymentNowRejected ? 'balance ' : ''}payment proof for booking ${booking.bookingId} could not be verified. Please upload a new proof.`,
        { booking }
      );
    }

    if (chargeChanged) {
      const isInstallation = booking.service?.serviceType === SERVICE_TYPE.INSTALLATION;
      const amount = isInstallation ? booking.mobilizationFee : booking.distanceAdjustment;
      const label = isInstallation ? 'mobilization fee' : 'distance-based charge';
      await sendNotification(
        booking.customer,
        NOTIFICATION_TYPE.CHARGE_UPDATED,
        `A ${label} of ₱${amount.toLocaleString()} was added to booking ${booking.bookingId} for an address outside Quezon City. This has been reflected in your total.`,
        { booking }
      );
    }

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
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
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.refund?.status !== REFUND_STATUS.PENDING) {
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
    booking.refund.status = REFUND_STATUS.PROCESSED;
    booking.refund.processedAt = new Date();
    booking.refund.processedBy = req.userId;

    await booking.save();

    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.REFUND_PROCESSED,
      `Your refund of ₱${(booking.refund.refundableAmount || 0).toLocaleString()} for booking ${booking.bookingId} has been processed.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Customer: flag a refund that hasn't come through (e.g. marked Processed but
// never actually received). Single message + status, not a ticketing thread -
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

    if (!booking.refund || booking.refund.status === REFUND_STATUS.NONE) {
      return res.status(400).json({ message: 'There is no refund on this booking to flag.' });
    }

    if (booking.refund.customerFlag?.flagged && !booking.refund.customerFlag?.resolved) {
      return res.status(400).json({ message: "You've already flagged this refund - our team will follow up." });
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
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: mark a customer's refund flag as addressed (followed up outside the
// system - a phone call, etc.) so it stops showing as needing attention.
router.patch('/:bookingId/refund/flag/resolve', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
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
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: reschedule a booking that had a disruption reported on it. This is the
// exact hook point Notification Sender was built for - both the client and the
// assigned technician are notified right away as part of this action.
router.patch('/:bookingId/disruption/reschedule', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
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

    if (!TIME_BLOCKS.includes(time)) {
      return res.status(400).json({ message: 'Time must be Morning or Afternoon.' });
    }

    const conflict = await findConflictingBooking(getMemberIds(booking), date, time, booking.bookingId);
    if (conflict) {
      return res.status(409).json({
        message: `A technician on this job is already booked ${date} (${time}) on ${conflict.bookingId}. Choose a different date or time.`
      });
    }

    booking.date = date;
    booking.time = time;
    // Nobody is actively working on it during the gap until the new date - back to
    // 'Approved' (scheduled, not in progress) rather than leaving it looking active.
    booking.status = BOOKING_STATUS.APPROVED;
    booking.disruption.status = 'Rescheduled';
    booking.disruption.rescheduledAt = new Date();

    await booking.save();

    const message = `Booking ${booking.bookingId} (${booking.service?.name || 'service'}) was interrupted and has been rescheduled to ${date}, ${time}.`;
    await sendNotification(booking.customer, NOTIFICATION_TYPE.DISRUPTION_RESCHEDULED, message, { booking });
    await notifyMembers(booking, NOTIFICATION_TYPE.DISRUPTION_RESCHEDULED, message);

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: approve a pending extension request - grants the extra day. Notifies the
// requesting technician and the client, whose completion timeline just changed.
router.patch('/:bookingId/extension/approve', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
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

    await notifyMembers(booking, NOTIFICATION_TYPE.EXTENSION_APPROVED, `The extension request for booking ${booking.bookingId} has been approved.`);
    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.EXTENSION_APPROVED,
      `Your technician requested an extra day to finish booking ${booking.bookingId} - this has been approved, so completion will take a bit longer than originally scheduled.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
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
    if (req.userRole !== ROLE.ADMIN) {
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

    await notifyMembers(booking, NOTIFICATION_TYPE.EXTENSION_DENIED, `The extension request for booking ${booking.bookingId} was not approved.`);
    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.EXTENSION_DENIED,
      `Your technician's request for extra time on booking ${booking.bookingId} was not approved - your original schedule stands.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
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