const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { ROLE } = require('../constants/roles');
const { REFUND_STATUS } = require('../constants/refundStatus');
const { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const { PAYMENT_MODE } = require('../constants/paymentModes');
const { BOOKING_STATUS, BOOKING_STATUS_VALUES } = require('../constants/bookingStatus');
const multer = require('multer');
const auditSpecs = require('../utils/auditSpecs');
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
  getSeniorDiscountAmount, getAppliedDiscount, getPaymentBreakdown,
} = require('../utils/pricing');
const Promo = require('../models/Promo');
const { pickBestPromo } = require('../utils/promos');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { isWithinServiceArea } = require('../utils/serviceArea');
const { runBookingStatusCheck } = require('../jobs/bookingStatusJob');
const { getOrCreateSettings } = require('../utils/paymentSettings');
const { proposeAssignment, suggestNextDates } = require('../utils/autoAssign');
const { toTechnicianView } = require('../utils/technicianView');
const { allowRoles } = require('../middleware/roles');
const { listFieldTechnicians, hasFieldPosition, isFieldTechnician } = require('../utils/technicians');
const { toCustomerView } = require('../utils/customerView');
const { loadBackJobContexts } = require('../utils/backJobContext');
const BackJob = require('../models/BackJob');
const { TECHNICIAN_BOOKING_FILTER, isHiddenFromTechnicians } = require('../utils/technicianVisibility');
const scheduling = require('../constants/scheduling');
const { createUploader, discardUploads, PROOF_TYPES, UPLOADS_ROOT } = require('../utils/uploadSafety');
const { manilaToday, isAtLeastDaysAhead } = require('../utils/manilaDate');
const { readFeedback } = require('../utils/feedbackInput');
const { normalizeContactNumber } = require('../utils/contactNumber');
const { sendRouteError } = require('../utils/routeErrors');
const { planPaymentChange, planInPersonPayment, commitPayment } = require('../utils/paymentVerification');
const { describeChargeChanges } = require('../utils/chargeNotice');
const { buildPriceSnapshot } = require('../utils/priceSnapshot');
const { readPaging } = require('../utils/adminInput');
const { serviceProblem, unitsProblem } = require('../utils/bookingValidation');
const { downPaymentProblem, balanceProblem, firstPaymentModeProblem, DOWN_PAYMENT_BOOKING_STATUSES, DOWN_PAYMENT_OPEN, BALANCE_BOOKING_STATUSES, BALANCE_OPEN } = require('../utils/paymentGuards');
const { nextQueueRank, reorder: reorderQueue, getQueue } = require('../utils/queue');
const { generateBookingId, createWithUniqueBookingId, BookingIdExhaustedError } = require('../utils/bookingId');
const { invalid, sendProblem } = require('../utils/validation');
const { readPaymentSubmission, findSameReference } = require('../utils/paymentReference');
const { resolveRefundAmounts } = require('../utils/refundAmounts');
const Closure = require('../models/Closure');
const { businessDayProblem } = require('../utils/businessDays');
const { isRealDateKey } = require('../utils/closures');
const { nextWorkingDayKey, extensionSlotProblem, addDays } = require('../utils/extensionDays');
const {
  ASSIGNMENT_POPULATE, getMemberIds, getLeadIds, getPrimaryLeadId, getRoleFor,
  memberFilter, findConflictingBooking, getBusyTechnicianIds, getAssignments, staffingProblem,
} = require('../utils/assignments');
const { readReason, buildHistoryEntry, viewHistory, idsIn } = require('../utils/assignmentHistory');
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

// The same, for a customer: only the fields a customer may see (utils/customerView.js).
const customerBooking = (booking) => toCustomerView(withWarranty(booking));

// ============================================
// 1. CONFIGURATION & HELPERS
// ============================================

// Payment, ID, refund and purchase proofs: JPG, PNG, WEBP or PDF only, random stored name with an
// extension from the validated type, first bytes checked (utils/uploadSafety.js).
const upload = createUploader({
  dir: path.join(UPLOADS_ROOT, 'proofs'),
  allowedTypes: PROOF_TYPES,
});

// Validate date: a real YYYY-MM-DD date at least 3 days after today in Manila (utils/manilaDate.js), whatever
// time zone the server runs in.
const MIN_LEAD_DAYS = 3;
const isDateAllowed = (dateStr) => isAtLeastDaysAhead(dateStr, MIN_LEAD_DAYS);

// The next dates when enough technicians are free, offered with a refusal. It is a help, never the answer: if looking them
// up fails or takes more than a few seconds, the refusal goes out without them.
async function suggestionsFor(booking) {
  try {
    return await Promise.race([suggestNextDates(booking), new Promise((resolve) => { setTimeout(() => resolve([]), 4000).unref(); })]);
  } catch (err) {
    console.error('Could not look up suggested dates:', err.message);
    return [];
  }
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

// Tells every technician on the job about a change, once each. A booking that was Pending before the change was never
// visible to its technicians (see utils/technicianVisibility.js), so nobody is told about it. A notification problem
// never fails the change that was already saved. `wasStatus` is the status before the change.
async function notifyMembersOfChange(booking, wasStatus, type, message) {
  if (wasStatus === BOOKING_STATUS.PENDING) return;
  try {
    await notifyMembers(booking, type, message);
  } catch (err) {
    console.error(`Could not notify the technicians on booking ${booking.bookingId}:`, err);
  }
}

// Today's date in Manila as YYYY-MM-DD, for same-day-cancellation comparisons against booking.date.
const todayDateString = () => manilaToday();

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

// Returns 'opened' when a refund was opened, 'awaiting-check' when the down payment proof is still waiting to be verified (no refund is
// opened for an amount nobody has checked: the booking is flagged, and the refund opens once an admin verifies the proof), or
// 'none' when no down payment is on file.
function openRefundIfEligible(booking) {
  if (booking.downPaymentPercent > 0 && booking.paymentStatus === PAYMENT_STATUS.TO_VERIFY) {
    booking.paymentCheckAfterCancel = true;
    return 'awaiting-check';
  }
  const hasDownPaymentOnFile =
    booking.downPaymentPercent > 0 &&
    [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus);

  if (!hasDownPaymentOnFile) return 'none';

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
  return 'opened';
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
    sendRouteError(res, err);
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
    sendRouteError(res, err);
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
    sendRouteError(res, err);
  }
});

// ============================================
// 2. CUSTOMER ROUTES (Booking Management)
// ============================================

// Create a booking (initial submission with proof). Normally the caller is the
// customer themselves; an admin creating a walk-in/phone-in booking on someone
// else's behalf may pass `customer` to book it under that customer's account
// instead - only admins can do this, everyone else always books under their own id.
router.post('/', auth, allowRoles(ROLE.CUSTOMER, ROLE.ADMIN), (req, res, next) => {
  req.generatedBookingId = generateBookingId();
  next();
}, upload.fields([{ name: 'proof', maxCount: 1 }, { name: 'discountId', maxCount: 1 }]), async (req, res) => {
  try {
    // A refused request must not leave its uploaded file behind.
    res.on('finish', () => { if (res.statusCode >= 400) discardUploads(req); });

    const {
      service, units: unitsRaw, problemDescription,
      date, time, technician, address,
      downPaymentPercent, paymentMode, paymentMode2, referenceNumber,
      customer, clientSuppliedUnit, unitWaiverAcknowledged, unitWaiverName, contactNumber,
      lastCleanedOver6MonthsAgo, isActivelyLeaking,
      poNumber, paymentTermsDays, discountType,
    } = req.body;

    // Payment terms are agreed by an admin, never sent by a customer: a customer's paymentTermsDays is ignored. Only an
    // admin booking a walk-in may give terms here, and they must be 7 to 10 days.
    if (req.userRole === ROLE.ADMIN && paymentTermsDays !== undefined && paymentTermsDays !== '' && paymentTermsDays !== null) {
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

    const closedOnCreate = await businessDayProblem(Closure, date);
    if (closedOnCreate) return sendProblem(res, closedOnCreate);

    if (!TIME_BLOCKS.includes(time)) {
      return res.status(400).json({ message: 'Time must be Morning or Afternoon.' });
    }

    if (typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ message: 'Address is required.' });
    }

    const cleanContactNumber = normalizeContactNumber(contactNumber);
    if (!cleanContactNumber) {
      return res.status(400).json({ message: 'A valid contact number is required (7 to 15 digits).' });
    }

    // A requested technician must be an active field technician (not a secretary, a cashier, an admin or anyone else).
    // If they are busy that day the system simply chooses someone else (below); the customer is not turned away.
    if (technician) {
      const requested = typeof technician === 'string' ? await User.findById(technician).select('role isActive position') : null;
      if (!isFieldTechnician(requested)) {
        return res.status(400).json({ message: 'That technician cannot be requested. Choose a technician from the list, or leave it open.' });
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

    // The booking must fit its service: the service exists and is open for booking, a cleaning booking uses the tier its
    // two answers lead to, and every unit has a known type, a whole quantity and a price (utils/bookingValidation.js).
    const serviceDoc = await Service.findById(service).select('name serviceType isActive isArchived hiddenFromDirectSelection price unitTypePricing');
    const serviceIssue = await serviceProblem({
      service: serviceDoc,
      cleaningServices: serviceDoc?.serviceType === SERVICE_TYPE.CLEANING
        ? await Service.find({ serviceType: SERVICE_TYPE.CLEANING, isActive: { $ne: false }, isArchived: { $ne: true } }).select('name price')
        : [],
      answers: { lastCleanedOver6MonthsAgo, isActivelyLeaking },
      isAdmin: req.userRole === ROLE.ADMIN,
    });
    if (serviceIssue) return sendProblem(res, serviceIssue);
    const unitIssue = await unitsProblem(units, serviceDoc);
    if (unitIssue) return sendProblem(res, unitIssue);

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
      // A walk-in booking belongs to a customer account: one that exists, is active, and is a customer (not a
      // technician, an admin or a deactivated account).
      if (!bookingCustomer || bookingCustomer.role !== ROLE.CUSTOMER) {
        return res.status(400).json({ message: 'Selected customer account not found.' });
      }
      if (bookingCustomer.isActive === false) {
        return res.status(400).json({ message: 'That customer account is deactivated. Activate it first, or choose another customer.' });
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

    // The terms on this booking: the ones the admin agreed for the account, or (an admin walk-in only) the ones the admin
    // typed. A commercial client with no terms pays a down payment like everyone else.
    const agreedTerms = bookingCustomer?.agreedPaymentTermsDays;
    let termsDays = null;
    if (isCommercial) {
      if (Number.isInteger(agreedTerms) && agreedTerms >= 7 && agreedTerms <= 10) termsDays = agreedTerms;
      else if (req.userRole === ROLE.ADMIN && paymentTermsDays) termsDays = Number(paymentTermsDays);
    }

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
      const hasPaymentTerms = termsDays !== null;
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
    // A customer's first payment cannot be cash or cheque, whatever the form offers. An admin walk-in may record them.
    if (req.userRole !== ROLE.ADMIN) {
      const firstModeProblem = firstPaymentModeProblem(paymentMode);
      if (firstModeProblem) return sendProblem(res, firstModeProblem);
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

    // A customer who submits a payment now (proof or reference given) must give both for GCash and
    // Bank Transfer. With neither, the booking is made unpaid and paid later from Billing. An admin
    // booking on behalf of a customer may leave the reference out.
    const paymentSubmission = readPaymentSubmission({
      mode: paymentMode,
      reference: referenceNumber,
      hasProof: !!proofFile,
      strict: !isAdminWalkIn && (!!proofFile || !!(referenceNumber && String(referenceNumber).trim())),
    });
    if (paymentSubmission.problem) return sendProblem(res, paymentSubmission.problem);

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

    // A booking is never marked paid just because an admin made it. Money received in person is recorded afterwards, on
    // purpose, with the method, the amount and who received it (PATCH /:bookingId/record-payment). A proof attached here
    // goes through the normal check like any other.
    const paymentStatus = proofFile ? PAYMENT_STATUS.TO_VERIFY : PAYMENT_STATUS.UNPAID;

    const withinServiceArea = isWithinServiceArea(address);

    // Guard against stale cleaning-tier answers riding along onto a booking for
    // a different (or no longer Cleaning) service - the client also resets these
    // on service switch, but this is the actual enforcement point.
    const isCleaningService = serviceDoc.serviceType === SERVICE_TYPE.CLEANING;

    const queueRank = await nextQueueRank(); // last in line: first come, first served
    const booking = await createWithUniqueBookingId((bookingId) => Booking.create({
      bookingId,
      queueRank,
      customer: bookingCustomerId,
      service, units, problemDescription,
      priceSnapshot: buildPriceSnapshot(serviceDoc, units),
      date, time, requestedTechnician: technician || undefined, address: address.trim(), contactNumber: cleanContactNumber,
      downPaymentPercent, paymentMode, paymentMode2,
      paymentStatus, proofFile, referenceNumber: paymentSubmission.reference,
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
      poNumber: isCommercial && poNumber ? String(poNumber).trim().slice(0, 40) : null,
      paymentTermsDays: termsDays,
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
    // The amount of a down payment on file is recorded when it is verified or received, never from a submission nobody
    // has checked.
    if (isCommercial || discountApprovedNow || bestPromo) {
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

    // The system proposes who will do it: the technician the customer asked for if they are free, otherwise the usual
    // choice. It is only a proposal: hidden from the customer and from the technicians until the admin approves. A
    // failure here never fails the booking, it just stays unassigned for the admin to assign by hand.
    if (!isAdminWalkIn) {
      await notifyAdmins(
        NOTIFICATION_TYPE.BOOKING_NEW,
        `New booking ${populated.bookingId} for ${populated.service?.name || 'a service'} on ${populated.date}, ${populated.time}${bookingCustomer?.name ? ` from ${bookingCustomer.name}` : ''}.`,
        { booking: populated }
      );
    }

    const auto = await autoAssignNewBooking(populated);

    // an admin booking for a walk-in sees everything, and the dates when someone is free if nobody was free that day; a
    // customer only what is theirs to see
    res.status(201).json(req.userRole === ROLE.ADMIN
      ? { ...withWarranty(populated), ...(auto.suggestedDates.length > 0 ? { suggestedDates: auto.suggestedDates } : {}) }
      : customerBooking(populated));
  } catch (err) {
    if (err instanceof BookingIdExhaustedError) { console.error(err); return res.status(500).json({ message: err.message }); }
    sendRouteError(res, err);
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
    res.json(enriched.map(toCustomerView));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Get busy technicians for a specific date. Must stay registered before
// GET /:bookingId below - Express matches in registration order, so any
// single-segment GET path declared after it is swallowed as a bookingId lookup
// (this route used to sit after it and always 404'd "Booking not found").
router.get('/busy-technicians', auth, async (req, res) => {
  try {
    // The booking form (customer and admin walk-in) uses this. A technician does not need it.
    if (req.userRole === ROLE.STAFF) {
      return res.status(403).json({ message: 'Forbidden' });
    }
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
    sendRouteError(res, err);
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
    sendRouteError(res, err);
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
    const technicians = (await listFieldTechnicians(User, 'name')).sort((a, b) => String(a.name).localeCompare(String(b.name)));
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
    sendRouteError(res, err);
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
    res.json(toCustomerView(obj));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Cancel a booking. If a down payment was actually on file, this also opens a
// refund request (Cancellation, Rescheduling, and Refund Module) - same-day
// cancellations get flagged so the dispatch/transportation cost can be deducted
// before an admin processes it; pre-service cancellations refund in full.
router.patch('/:bookingId/cancel', auth, auditSpecs.customerCancel, allowRoles(ROLE.CUSTOMER), async (req, res) => {
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

    const refundOutcome = openRefundIfEligible(booking);

    const statusBeforeCancel = booking.status;
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancelledAt = new Date();
    booking.cancelledBy = 'customer';
    await booking.save();

    // the technicians on an Approved job are told it will not happen
    await notifyMembersOfChange(booking, statusBeforeCancel, NOTIFICATION_TYPE.BOOKING_CANCELLED, `Booking ${booking.bookingId} (${booking.date}, ${booking.time}) was cancelled. You no longer need to attend.`);

    // Every admin is told once: with a refund waiting, the refund notice already says the booking was cancelled; otherwise a
    // plain cancellation notice.
    if (booking.refund?.status === REFUND_STATUS.PENDING) {
      await notifyAdmins(
        NOTIFICATION_TYPE.REFUND_REQUESTED,
        `Booking ${booking.bookingId} was cancelled by the customer and a refund request is waiting for review${booking.refund.isSameDay ? ' (same-day cancellation, deduction needed)' : ''}.`,
        { booking }
      );
    } else if (refundOutcome === 'awaiting-check') {
      await notifyAdmins(NOTIFICATION_TYPE.PAYMENT_SUBMITTED, `Booking ${booking.bookingId} was cancelled by the customer while its down payment proof is still waiting. Verify or reject the proof; a refund opens once it is verified.`, { booking });
    } else {
      await notifyAdmins(NOTIFICATION_TYPE.BOOKING_CANCELLED, `Booking ${booking.bookingId} was cancelled by the customer.`, { booking });
    }

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(customerBooking(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Customer: Submit/upload initial down payment proof. Only for the owner, only while the booking is Pending or
// Approved, and only while no proof is waiting or verified (nothing yet, or the admin rejected the last one). The
// status change is one conditional update, so two submissions at once cannot both pass, and a verified proof is
// never overwritten. The amount on file is not touched here: it is set when the admin verifies the payment.
router.patch('/:bookingId/pay', auth, allowRoles(ROLE.CUSTOMER), upload.single('proof'), async (req, res) => {
  const refuse = (problem) => { discardUploads(req); return sendProblem(res, problem); };
  try {
    const proofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;

    const booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId }).populate('service');
    if (!booking) { discardUploads(req); return res.status(404).json({ message: 'Booking not found' }); }

    const stateProblem = downPaymentProblem(booking);
    if (stateProblem) return refuse(stateProblem);

    const submission = readPaymentSubmission({
      mode: booking.paymentMode, reference: req.body.referenceNumber, hasProof: !!proofFile, strict: true,
    });
    if (submission.problem) return refuse(submission.problem);

    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        customer: req.userId,
        status: { $in: DOWN_PAYMENT_BOOKING_STATUSES },
        paymentStatus: { $in: DOWN_PAYMENT_OPEN },
      },
      { $set: {
        paymentStatus: PAYMENT_STATUS.TO_VERIFY,
        ...(proofFile ? { proofFile } : {}),
        ...(submission.reference ? { referenceNumber: submission.reference } : {}),
      } },
      { new: true }
    ).populate('service');
    if (!updated) return refuse(invalid('Your payment could not be saved because the booking just changed. Reload and check its status.', 409));

    await notifyAdmins(NOTIFICATION_TYPE.PAYMENT_SUBMITTED, `Booking ${updated.bookingId}: the customer sent a down payment proof to verify.`, { booking: updated });
    res.json(customerBooking(updated));
  } catch (err) {
    discardUploads(req);
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Customer: Submit/upload final balance payment proof. Only for the owner, only when a balance is really due (the
// down payment is verified and the balance is not waiting or verified), on an Approved, In Progress or Completed
// booking. Same atomic update and same file cleanup as the down payment.
router.patch('/:bookingId/pay-balance', auth, allowRoles(ROLE.CUSTOMER), upload.single('proof'), async (req, res) => {
  const refuse = (problem) => { discardUploads(req); return sendProblem(res, problem); };
  try {
    const proofFile = req.file ? `/uploads/proofs/${req.file.filename}` : undefined;

    const booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId }).populate('service');
    if (!booking) { discardUploads(req); return res.status(404).json({ message: 'Booking not found' }); }

    const stateProblem = balanceProblem(booking, getPaymentBreakdown(booking).balance);
    if (stateProblem) return refuse(stateProblem);

    const submission = readPaymentSubmission({
      mode: booking.paymentMode2, reference: req.body.referenceNumber, hasProof: !!proofFile, strict: true,
    });
    if (submission.problem) return refuse(submission.problem);

    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        customer: req.userId,
        status: { $in: BALANCE_BOOKING_STATUSES },
        balancePaymentStatus: { $in: BALANCE_OPEN },
      },
      { $set: {
        balancePaymentStatus: BALANCE_PAYMENT_STATUS.TO_VERIFY,
        ...(proofFile ? { balanceProofFile: proofFile } : {}),
        ...(submission.reference ? { balanceReferenceNumber: submission.reference } : {}),
      } },
      { new: true }
    ).populate('service');
    if (!updated) return refuse(invalid('Your payment could not be saved because the booking just changed. Reload and check its status.', 409));

    await notifyAdmins(NOTIFICATION_TYPE.PAYMENT_SUBMITTED, `Booking ${updated.bookingId}: the customer sent a balance payment proof to verify.`, { booking: updated });
    res.json(customerBooking(updated));
  } catch (err) {
    discardUploads(req);
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: record a payment received in person (cash, cheque, or GCash or a bank transfer shown at the counter). Nothing is
// verified until the admin says so here: the method, the amount and an optional reference or cheque number are stored with
// who received it and when (paymentEvents), and the payment becomes Verified because the admin is the one verifying it.
// Same state rules and the same one-step conditional update as verifying a customer's proof (utils/paymentVerification.js).
router.patch('/:bookingId/record-payment', auth, auditSpecs.recordPayment, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const planned = planInPersonPayment(booking, {
      track: req.body.track, method: req.body.method, amount: req.body.amount, reference: req.body.reference,
      allowedMethods: Object.values(PAYMENT_MODE),
    });
    if (planned.problem) return sendProblem(res, planned.problem);

    const actor = { id: req.userId, name: (await User.findById(req.userId).select('name'))?.name || '' };
    const committed = await commitPayment(Booking, booking, planned.plan, actor);
    if (!committed) {
      return res.status(409).json({ message: 'This payment was just changed by someone else, or the booking was cancelled. Reload and check its status.' });
    }

    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.PAYMENT_VERIFIED,
      `Your ${planned.plan.track === 'balance' ? 'balance ' : ''}payment for booking ${booking.bookingId} was received in person and recorded. Thank you!`,
      { booking }
    );

    const populated = await committed.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: other bookings with the same payment reference number. A warning only, never a block.
router.get('/:bookingId/reference-duplicates', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).select('bookingId referenceNumber balanceReferenceNumber');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ duplicates: await findSameReference(Booking, booking) });
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Customer: ask for the Senior Citizen / PWD discount on a booking they already made. Same ID
// upload and same admin approval flow as asking at booking time. Allowed while the booking is
// Pending or Approved, and only if there is no request yet or the last one was rejected.
router.patch('/:bookingId/discount/request', auth, allowRoles(ROLE.CUSTOMER), upload.single('discountId'), async (req, res) => {
  try {
    const { discountType } = req.body;
    if (discountType !== 'Senior' && discountType !== 'PWD') {
      return res.status(400).json({ message: 'Choose either Senior Citizen or PWD for the discount.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Upload a photo of a valid ID to request the Senior Citizen / PWD discount.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED].includes(booking.status)) {
      return res.status(400).json({ message: 'A discount can only be requested while the booking is Pending or Approved.' });
    }
    if (['Pending', 'Approved'].includes(booking.discount?.status)) {
      return res.status(400).json({ message: 'This booking already has a discount request.' });
    }

    booking.discount = { type: discountType, idFile: `/uploads/proofs/${req.file.filename}`, status: 'Pending', requestedAt: new Date() };
    await booking.save();

    await notifyAdmins(
      NOTIFICATION_TYPE.DISCOUNT_REQUESTED,
      `Booking ${booking.bookingId}: the customer requested the ${discountType === 'PWD' ? 'PWD' : 'Senior Citizen'} discount. Review the uploaded ID.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(customerBooking(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: approve a pending Senior Citizen / PWD discount. The rate comes from Payment
// Settings at this moment and is frozen on the booking. Nothing is refunded
// automatically: if a down payment was already verified, it is recorded so the balance
// is simply lower (see getPaymentBreakdown in utils/pricing.js).
router.patch('/:bookingId/discount/approve', auth, auditSpecs.discountApprove, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.discount?.status !== 'Pending') {
      return res.status(400).json({ message: 'There is no pending discount request on this booking.' });
    }
    // A discount changes what is owed, so it cannot be approved once the job is done or the booking is cancelled.
    if (booking.status === BOOKING_STATUS.CANCELLED) {
      return res.status(400).json({ message: 'This booking is cancelled, so a discount cannot be approved on it.' });
    }
    if (booking.status === BOOKING_STATUS.COMPLETED) {
      return res.status(400).json({ message: 'This booking is already completed, so a discount can no longer be approved on it.' });
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
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: reject a pending discount request. A short reason is required and is shown to
// the customer. The booking total stays exactly as it was.
router.patch('/:bookingId/discount/reject', auth, auditSpecs.discountReject, async (req, res) => {
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
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: move a Pending booking in the queue. Body: { action: 'up' | 'down' | 'top' }.
// Answers with the whole queue so the screen can replace its list in one step.
router.patch('/:bookingId/queue', auth, auditSpecs.queueMove, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const result = await reorderQueue(req.params.bookingId, req.body.action);
    if (result.error) return res.status(400).json({ message: result.error });
    // the proposals for that date and time block follow the new order
    await reproposeBlock(req.params.bookingId, req.userId);

    const queue = await getQueue();
    res.json(queue.map((item) => ({ ...item, booking: withWarranty(item.booking) })));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: upload proof a CZA-supplied unit was actually purchased through CZA -
// backs a future 5yr/1yr Unit Warranty claim, mirrors the client-supplied-unit
// waiver's role but for the opposite case. Admin-side (not the customer's), since
// CZA is the one that made the sale and holds the record of it.
router.patch('/:bookingId/unit-purchase-proof', auth, auditSpecs.unitPurchaseProof, allowRoles(ROLE.ADMIN), upload.single('proof'), async (req, res) => {
  try {
    // A refused request must not leave its uploaded file behind.
    res.on('finish', () => { if (res.statusCode >= 400) discardUploads(req); });

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
    sendRouteError(res, err);
  }
});

// Request a reschedule. Only a Pending booking (the date changes straight away) or an Approved one (the admin must
// approve the new date) can be moved. An In Progress, Completed or Cancelled booking cannot. A booking has one open
// request at a time: a second one while the first waits is refused and does not notify the admins again.
router.patch('/:bookingId/reschedule', auth, allowRoles(ROLE.CUSTOMER), async (req, res) => {
  try {
    const { date, time } = req.body;

    if (!isDateAllowed(date)) {
      return res.status(400).json({
        message: 'New date must be at least 3 days from today.'
      });
    }

    const closedOnReschedule = await businessDayProblem(Closure, date);
    if (closedOnReschedule) return sendProblem(res, closedOnReschedule);

    if (!TIME_BLOCKS.includes(time)) {
      return res.status(400).json({ message: 'Time must be Morning or Afternoon.' });
    }

    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      customer: req.userId
    });

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED].includes(booking.status)) {
      return res.status(400).json({
        message: `A ${booking.status} booking can no longer be rescheduled. Only a Pending or Approved booking can be moved.`
      });
    }
    if (booking.date === date && booking.time === time) {
      return res.status(400).json({ message: 'That is the date and time the booking already has. Choose another.' });
    }

    const populateAfter = [
      { path: 'service' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ];

    if (booking.status === BOOKING_STATUS.PENDING) {
      // The date changes straight away. Whoever was proposed for the old date is dropped and proposed again below.
      booking.date = date;
      booking.time = time;
      booking.rescheduleRequest = { requestedDate: null, requestedTime: null, status: 'None' };
      await booking.save();
      await booking.populate('service');
      await repropose(booking, req.userId);
      const populated = await booking.populate(populateAfter);
      return res.json(customerBooking(populated));
    }

    // Approved: one open request per booking. The status check is part of the update, so two requests at once cannot both pass.
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, customer: req.userId, status: BOOKING_STATUS.APPROVED, 'rescheduleRequest.status': { $ne: 'Pending' } },
      { $set: { rescheduleRequest: { requestedDate: date, requestedTime: time, status: 'Pending' } } },
      { new: true }
    );
    if (!updated) {
      return res.status(400).json({ message: 'You already asked to move this booking. Please wait for our team to answer that request.' });
    }

    await notifyAdmins(
      NOTIFICATION_TYPE.RESCHEDULE_REQUESTED,
      `Booking ${updated.bookingId}: the customer asked to move the service to ${date}, ${time}. Approval needed.`,
      { booking: updated }
    );
    // the customer gets a confirmation that the request was received
    await sendNotification(
      updated.customer,
      NOTIFICATION_TYPE.RESCHEDULE_RECEIVED,
      `We received your request to move booking ${updated.bookingId} to ${date}, ${time}. Our team will confirm it. Until then your booking stays on ${updated.date}, ${updated.time}.`,
      { booking: updated }
    );

    const populated = await updated.populate(populateAfter);
    res.json(customerBooking(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Submit or edit feedback for a completed booking (customer). The rating is a whole number from 1 to 5 and the comment
// is at most 500 characters. It can be changed for 24 hours after it was first given; each change keeps the earlier
// version with the time it was replaced.
const FEEDBACK_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

router.patch('/:bookingId/feedback', auth, allowRoles(ROLE.CUSTOMER), async (req, res) => {
  try {
    const input = readFeedback(req.body);
    if (input.problem) return sendProblem(res, input.problem);

    const booking = await Booking.findOne({
      bookingId: req.params.bookingId,
      customer: req.userId,
    });

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      return res.status(400).json({ message: 'Feedback can only be left once the service is completed.' });
    }

    const previousFeedback = booking.feedback;
    const previouslySubmittedAt = previousFeedback?.createdAt;
    if (previouslySubmittedAt && Date.now() - new Date(previouslySubmittedAt).getTime() > FEEDBACK_EDIT_WINDOW_MS) {
      return res.status(400).json({ message: 'Feedback can no longer be edited (24-hour window has passed).' });
    }

    const now = new Date();
    booking.feedback = {
      text: input.values.text,
      rating: input.values.rating,
      createdAt: previouslySubmittedAt || now,
      ...(previouslySubmittedAt
        ? {
          editedAt: now,
          edits: [...(previousFeedback.edits || []), { text: previousFeedback.text || '', rating: previousFeedback.rating, replacedAt: now }],
        }
        : {}),
    };

    await booking.save();
    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(customerBooking(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// ============================================
// 3. TECHNICIAN ROUTES
// ============================================

// Get jobs assigned to the logged-in technician
router.get('/technician/mine', auth, async (req, res) => {
  try {
    // Every job where this technician is the lead or the helper, labelled with their role.
    const jobs = await Booking.find({ ...memberFilter(req.userId), ...TECHNICIAN_BOOKING_FILTER })
      .populate('service')
      .populate('customer', 'name phone')
      .populate('technician', 'name')
      .populate(ASSIGNMENT_POPULATE)
      .sort({ date: -1 });
    // A back job visit also carries what it follows (original booking, date, technicians, original report summary).
    const backJobs = await loadBackJobContexts(jobs, { BackJob, Booking, Report, User });
    // A whitelist, never the whole booking: no payments, proofs, discount ID or refund data.
    res.json(jobs.map((j) => toTechnicianView(j.toObject(), {
      myRole: getRoleFor(j, req.userId), isPrimaryLead: getPrimaryLeadId(j) === req.userId,
      ...(backJobs.has(j.bookingId) ? { backJob: backJobs.get(j.bookingId) } : {}),
    })));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Get dashboard stats for the logged-in technician
router.get('/technician/mine/stats', auth, async (req, res) => {
  try {
    // Jobs count for the lead and the helper alike.
    const jobs = await Booking.find({ ...memberFilter(req.userId), ...TECHNICIAN_BOOKING_FILTER });

    // Back job visits (free repairs after a warranty claim) are counted on their own, not in the regular totals.
    const regular = jobs.filter((j) => !j.isBackJob);
    const backJobVisits = jobs.filter((j) => j.isBackJob);
    const backJobs = {
      ongoing: backJobVisits.filter((j) => [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(j.status)).length,
      completed: backJobVisits.filter((j) => j.status === BOOKING_STATUS.COMPLETED).length,
    };

    const ongoing = regular.filter(j => [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(j.status)).length;
    const completed = regular.filter(j => j.status === BOOKING_STATUS.COMPLETED).length;
    // A completed job is waiting on a report when no Report document exists for it
    // (reports live in their own collection; booking.report is a legacy field that
    // is never filled any more).
    // Only the lead files the report, so only the lead's jobs wait on one.
    const leadJobs = regular.filter(j => getRoleFor(j, req.userId) === 'Lead');
    const completedIds = leadJobs.filter(j => j.status === BOOKING_STATUS.COMPLETED).map(j => j.bookingId);
    const reportedIds = new Set(await Report.find({ bookingId: { $in: completedIds } }).distinct('bookingId'));
    const completedWithoutReport = completedIds.filter(id => !reportedIds.has(id)).length;
    // An In Progress job is waiting for its report (submitting it is what completes the job).
    const pendingReports = leadJobs.filter(j => j.status === BOOKING_STATUS.IN_PROGRESS).length + completedWithoutReport;
    // No ratings or customer feedback here: technicians do not receive them. Admins read them in the Performance Review.
    res.json({ ongoing, completed, pendingReports, backJobs });
  } catch (err) {
    sendRouteError(res, err);
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
    if (!booking || isHiddenFromTechnicians(booking)) return res.status(404).json({ message: 'Booking not found' });

    if (!getMemberIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Not your booking' });
    }
    if (!getLeadIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Only the lead technician can report a disruption. Please tell your lead.' });
    }

    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ message: 'A disruption can only be reported on a job that is in progress.' });
    }

    if (booking.disruption?.status === 'Reported') {
      return res.status(400).json({ message: 'A disruption has already been reported for this booking.' });
    }

    // One report at a time: the check is part of the update, so two reports at once cannot both be saved or both notify.
    const reported = await Booking.findOneAndUpdate(
      { _id: booking._id, status: BOOKING_STATUS.IN_PROGRESS, 'disruption.status': { $ne: 'Reported' } },
      { $set: { disruption: { status: 'Reported', reason: reason.trim(), reportedAt: new Date(), reportedBy: req.userId } } },
      { new: true }
    );
    if (!reported) {
      return res.status(400).json({ message: 'A disruption has already been reported for this booking.' });
    }

    await notifyAdmins(
      NOTIFICATION_TYPE.DISRUPTION_REPORTED,
      `A technician reported a disruption on booking ${reported.bookingId}: "${reason.trim().slice(0, 100)}". Reschedule needed.`,
      { booking: reported }
    );
    // The customer is told the job was interrupted and a new schedule is being arranged: no reason, no technician details.
    try {
      await sendNotification(
        reported.customer,
        NOTIFICATION_TYPE.DISRUPTION_NOTICE,
        `Your service for booking ${reported.bookingId} was interrupted. We are arranging a new schedule and will tell you as soon as it is set.`,
        { booking: reported }
      );
    } catch (notifyError) {
      console.error(`Could not notify the customer about the disruption on booking ${reported.bookingId}:`, notifyError);
    }
    const populated = await reported.populate(['service', 'technician', 'customer', ...ASSIGNMENT_POPULATE]);
    res.json(toTechnicianView(populated.toObject(), { myRole: getRoleFor(populated, req.userId), isPrimaryLead: getPrimaryLeadId(populated) === req.userId }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// The extra day (a date and a time block) for an extension, from what was asked or the default: the next working
// day after the job's date (or today, if the job is older), in the same time block. Returns { date, time } or
// { error: { status, message } }. It refuses a Sunday, a closed shop date, a day before the job or in the past, the
// job's own block, and a day that is already approved.
async function resolveExtensionSlot(booking, { date, time }) {
  const today = manilaTodayKey();
  const base = booking.date && booking.date > today ? booking.date : today;
  let chosenDate = typeof date === 'string' && date.trim() ? date.trim() : null;
  if (!chosenDate) {
    // skip the shop's closure dates when picking the default
    const closed = new Set((await Closure.find({ date: { $gte: addDays(base, 1), $lte: addDays(base, 31) } }).select('date').lean()).map((c) => c.date));
    chosenDate = nextWorkingDayKey(base, closed);
  }
  const chosenTime = typeof time === 'string' && time.trim() ? time.trim() : booking.time;
  const problem = extensionSlotProblem({ date: chosenDate, time: chosenTime }, booking, today);
  if (problem) return { error: { status: 400, message: problem } };
  const closedProblem = await businessDayProblem(Closure, chosenDate);
  if (closedProblem) return { error: { status: closedProblem.status || 400, message: closedProblem.message } };
  return { date: chosenDate, time: chosenTime };
}

// Technician: request an extra day to finish a job that's underway - this isn't
// automatic, admin has to approve it (see /:bookingId/extension/approve|deny below).
router.patch('/:bookingId/extension/request', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ message: 'Please describe why more time is needed.' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking || isHiddenFromTechnicians(booking)) return res.status(404).json({ message: 'Booking not found' });

    if (!getMemberIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Not your booking' });
    }
    if (!getLeadIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Only the lead technician can request an extension. Please tell your lead.' });
    }

    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ message: 'An extension can only be requested on a job that is in progress.' });
    }

    if (booking.extensionRequest?.status === 'Pending') {
      return res.status(400).json({ message: 'An extension request is already pending for this booking.' });
    }

    const slot = await resolveExtensionSlot(booking, { date: req.body.date, time: req.body.time });
    if (slot.error) return res.status(slot.error.status).json({ message: slot.error.message });

    booking.extensionRequest = {
      status: 'Pending',
      reason: reason.trim(),
      requestedDate: slot.date,
      requestedTime: slot.time,
      requestedAt: new Date(),
      requestedBy: req.userId,
    };

    await booking.save();

    await notifyAdmins(
      NOTIFICATION_TYPE.EXTENSION_REQUESTED,
      `A technician asked for an extra day (${slot.date}, ${slot.time}) on booking ${booking.bookingId}: "${reason.trim().slice(0, 100)}". Approval needed.`,
      { booking }
    );
    const populated = await booking.populate(['service', 'technician', 'customer', ...ASSIGNMENT_POPULATE]);
    res.json(toTechnicianView(populated.toObject(), { myRole: getRoleFor(populated, req.userId), isPrimaryLead: getPrimaryLeadId(populated) === req.userId }));
  } catch (err) {
    sendRouteError(res, err);
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

    // Optional paging: ?limit=&page= (at most 1000 a page). With neither, the whole list comes back as before.
    const read = readPaging(req.query);
    if (read.problem) return sendProblem(res, read.problem);

    let query = Booking.find()
      .populate('service')
      .populate('customer', 'name email phone clientType companyName representativeName')
      .populate('technician', 'name').populate(ASSIGNMENT_POPULATE)
      .sort({ createdAt: -1, _id: -1 });
    if (read.paging) {
      query = query.skip((read.paging.page - 1) * read.paging.limit).limit(read.paging.limit);
      res.set({ 'X-Total-Count': String(await Booking.countDocuments({})), 'X-Page': String(read.paging.page), 'X-Limit': String(read.paging.limit) });
    }
    const bookings = await query;

    const enriched = bookings.map((b) => {
      const obj = b.toObject();
      obj.warranty = getWarrantyStatus(b);
      return obj;
    });
    res.json(enriched);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Moves a booking to a new date and time as an approved reschedule: the date must be a business day (no Sunday while they
// are closed, no closure date), and the technicians on it must be free then (a Pending booking has only a proposal, so it is
// proposed again afterwards instead). The customer and the technicians are told. Returns { error: { status, message,
// suggestedDates? } } or { ok: true }. Shared by approving a customer's request and by the admin's one-click "use this date".
async function approveRescheduleTo(booking, date, time, { by }) {
  // The shop may have been closed on that date after the customer asked.
  const closed = await businessDayProblem(Closure, date);
  if (closed) return { error: { status: closed.status || 400, message: closed.message } };

  const pending = booking.status === BOOKING_STATUS.PENDING;
  if (!pending) {
    const conflict = await findConflictingBooking(getMemberIds(booking), date, time, booking.bookingId);
    if (conflict) {
      return {
        error: {
          status: 409,
          message: `The assigned technician is already booked ${date} (${time}) on ${conflict.bookingId}. Reassign the technician, deny this request, or choose a date when enough technicians are free.`,
          suggestedDates: await suggestionsFor({ ...booking.toObject(), service: booking.service, date, time }),
        },
      };
    }
  }

  // Extra days approved against the old schedule no longer fit the job, so they stop holding the technicians (the same rule as
  // the disruption reschedule). A pending request for another extra day is dropped with them. The 3-day rule is not checked
  // here: it applies when the customer asks, not when the admin answers.
  const releasedDays = (booking.extensionDays || []).length;
  booking.extensionDays = [];
  if (booking.extensionRequest?.status === 'Pending') booking.extensionRequest.status = 'Denied';

  booking.date = date;
  booking.time = time;
  booking.rescheduleRequest = { requestedDate: null, requestedTime: null, status: 'Approved' };
  await booking.save();

  const who = by === 'admin' ? 'our team' : 'the customer';
  await sendNotification(
    booking.customer,
    NOTIFICATION_TYPE.RESCHEDULE_APPROVED,
    by === 'admin'
      ? `Your booking ${booking.bookingId} was moved by our team. New schedule: ${booking.date}, ${booking.time}.`
      : `Your reschedule request for booking ${booking.bookingId} was approved. New schedule: ${booking.date}, ${booking.time}.`,
    { booking }
  );
  await notifyMembersOfChange(booking, booking.status, NOTIFICATION_TYPE.RESCHEDULE_APPROVED, `Booking ${booking.bookingId} was rescheduled by ${who}. New schedule: ${booking.date}, ${booking.time}.${releasedDays > 0 ? ` The extra ${releasedDays === 1 ? 'day' : 'days'} approved for the old schedule no longer apply, so you are free on ${releasedDays === 1 ? 'it' : 'them'}.` : ''}`);
  return { ok: true };
}

const RESCHEDULE_RESPONSE_POPULATE = [
  { path: 'service' },
  { path: 'customer', select: 'name email phone clientType companyName representativeName' },
  { path: 'technician', select: 'name' },
  ...ASSIGNMENT_POPULATE,
];

// Admin: approve a pending reschedule request
router.patch('/:bookingId/reschedule/approve', auth, auditSpecs.rescheduleApprove, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.rescheduleRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending reschedule request.' });
    }

    await booking.populate('service');
    const moved = await approveRescheduleTo(booking, booking.rescheduleRequest.requestedDate, booking.rescheduleRequest.requestedTime, { by: 'customer' });
    if (moved.error) {
      return res.status(moved.error.status).json({ message: moved.error.message, ...(moved.error.suggestedDates ? { suggestedDates: moved.error.suggestedDates } : {}) });
    }

    res.json(withWarranty(await booking.populate(RESCHEDULE_RESPONSE_POPULATE)));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: move a Pending or Approved booking to one of the suggested dates (or any date the rules allow) in one step. It goes
// through the same approval as a customer's request: closed days and Sundays are refused, the technicians must be free,
// and the customer and technicians are told. A Pending booking has its proposal made again for the new date.
router.patch('/:bookingId/reschedule/use-date', auth, auditSpecs.rescheduleUseDate, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { date, time } = req.body || {};
    if (typeof date !== 'string' || !isRealDateKey(date) || date < manilaTodayKey()) {
      return res.status(400).json({ message: 'Choose a real date that is not in the past.' });
    }
    if (!TIME_BLOCKS.includes(time)) return res.status(400).json({ message: 'Time must be Morning or Afternoon.' });

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED].includes(booking.status)) {
      return res.status(400).json({ message: `A ${booking.status} booking cannot be moved this way. Only a Pending or Approved booking can.` });
    }
    if (booking.date === date && booking.time === time) return res.status(400).json({ message: 'The booking already has that date and time.' });

    await booking.populate('service');
    const moved = await approveRescheduleTo(booking, date, time, { by: 'admin' });
    if (moved.error) {
      return res.status(moved.error.status).json({ message: moved.error.message, ...(moved.error.suggestedDates ? { suggestedDates: moved.error.suggestedDates } : {}) });
    }
    if (booking.status === BOOKING_STATUS.PENDING) await repropose(booking, req.userId);

    res.json(withWarranty(await booking.populate(RESCHEDULE_RESPONSE_POPULATE)));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: deny a pending reschedule request
router.patch('/:bookingId/reschedule/deny', auth, auditSpecs.rescheduleDeny, async (req, res) => {
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
    await notifyMembersOfChange(booking, booking.status, NOTIFICATION_TYPE.RESCHEDULE_DENIED, `The customer's reschedule request for booking ${booking.bookingId} was not approved. The schedule stays ${booking.date}, ${booking.time}.`);

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);
    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Validates a requested assignment and saves it on the booking. Shared by the manual assign
// route and the automatic assignment so both obey exactly the same rules. `requested` is
// [{ technicianId, helperId? }]: the technician is the lead (and becomes booking.technician),
// the optional helper is a second technician. It replaces the previous assignment, so it is
// also how a booking is reassigned. Everyone must be free in the booking's date and time block.
// One technician is enough to save; approval is what requires enough people for the service.
// Returns { error: { status, message } } or { ok: true }.
async function performAssignment(booking, requested, { changedBy, reason } = {}) {
  if ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status)) {
    return { error: { status: 400, message: 'A completed or cancelled booking cannot be reassigned.' } };
  }

  const resolved = [];
  const seen = new Set();

  for (const item of requested) {
    if (!item.technicianId) {
      return { error: { status: 400, message: 'Each assignment needs a technician.' } };
    }
    const ids = [item.technicianId, item.helperId].filter(Boolean);
    // only an active field technician can be put on a job (not a secretary or a cashier)
    const techs = (await User.find({ _id: { $in: ids }, role: ROLE.STAFF, isActive: true }).select('_id position')).filter((u) => hasFieldPosition(u.position));
    if (techs.length !== new Set(ids).size) {
      return { error: { status: 400, message: 'That technician is not available.' } };
    }
    const entry = { team: null, lead: item.technicianId, helper: item.helperId || null };

    for (const id of ids) {
      if (seen.has(id)) {
        return { error: { status: 400, message: 'The same technician cannot be assigned twice to one booking.' } };
      }
      seen.add(id);
    }
    resolved.push(entry);
  }

  // An Approved or In Progress booking must stay staffed: removing its helper (or leaving it with a lead only)
  // when the service needs a pair is refused. A Pending booking may be half assigned while the admin works.
  if ([BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
    const staffing = staffingProblem(resolved, booking.service, 'saving');
    if (staffing) return { error: { status: 400, message: staffing } };
  }

  // Hard block, per member, so the message can name who is the problem.
  for (const id of seen) {
    const conflict = await findConflictingBooking([id], booking.date, booking.time, booking.bookingId);
    if (conflict) {
      const who = await User.findById(id).select('name');
      return {
        error: {
          status: 409,
          message: `${who?.name || 'A technician'} is already booked ${booking.date} (${booking.time}) on ${conflict.bookingId}. Choose a different technician, or move the booking to a date when enough technicians are free.`,
          suggestedDates: await suggestionsFor(booking),
        },
      };
    }
  }

  const before = new Set(getMemberIds(booking));
  const previousAssignments = getAssignments(booking);
  booking.assignments = resolved;
  booking.technician = resolved[0].lead;
  booking.needsReassignment = false; // whoever is on it now is active (only active field technicians can be assigned)
  await booking.save();

  // The trail of who was on the job. Appended on the first assignment and on every change after.
  await Booking.updateOne(
    { _id: booking._id },
    { $push: { assignmentHistory: buildHistoryEntry({ before: previousAssignments, after: resolved, changedBy, reason }) } }
  );

  // Tell technicians who are newly on the job, and those who were taken off it. Nothing is sent while the
  // booking is Pending: technicians hear about the job when the admin approves it (notifyAssignedTechnicians).
  if (isHiddenFromTechnicians(booking)) return { ok: true };
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

// The assignment notification, sent to everyone on the job when it is approved. Until then the technicians
// proposed for a Pending booking are not told. Never throws: the approval has already been saved.
async function notifyAssignedTechnicians(booking) {
  const when = `${booking.date}, ${booking.time}`;
  for (const id of getMemberIds(booking)) {
    try {
      const role = getRoleFor(booking, id);
      await sendNotification(id, NOTIFICATION_TYPE.JOB_ASSIGNED, `You were assigned as ${role === 'Helper' ? 'helper' : 'lead'} on booking ${booking.bookingId} (${booking.service?.name || 'service'}) for ${when}.`, { booking });
    } catch (err) {
      console.error(`Could not notify ${id} about booking ${booking.bookingId}:`, err);
    }
  }
}

// Called when a booking is created without a requested technician: picks who should do it
// (utils/autoAssign.js) and assigns them. The admin can still change it by hand. It never
// throws, so a failure just leaves the booking unassigned.
async function autoAssignNewBooking(booking, reason = 'Assigned automatically by the system') {
  try {
    const proposal = await proposeAssignment(booking);
    if (!proposal.assignment) return { suggestedDates: proposal.suggestedDates || [] };
    await performAssignment(booking, [proposal.assignment], { reason });
    await booking.populate(ASSIGNMENT_POPULATE);
  } catch (err) {
    console.error('Auto-assign on create failed:', err);
  }
  return { suggestedDates: [] };
}

// A Pending booking's technicians are only a proposal. When the customer moves it to another date the old proposal no
// longer fits, so it is dropped (with a line in the assignment history) and the system proposes again for the new date,
// or leaves the booking unassigned when nobody is free. It never throws.
async function repropose(booking, changedBy) {
  try {
    const previous = getAssignments(booking);
    if (previous.length > 0) {
      booking.assignments = [];
      booking.technician = undefined;
      await booking.save();
      await Booking.updateOne(
        { _id: booking._id },
        { $push: { assignmentHistory: buildHistoryEntry({ before: previous, after: [], changedBy, reason: 'The customer moved the date, so the proposed technicians were dropped' }) } }
      );
    }
    await autoAssignNewBooking(booking, 'Proposed again after the customer moved the date');
  } catch (err) {
    console.error('Could not propose technicians again after a reschedule:', err);
  }
}

// Whether a Pending booking's technicians were chosen by the system (so the system may choose again) rather than by an admin by
// hand. The last line of the assignment history says which. A Pending booking with nobody is also the system's to propose for.
function isSystemProposal(booking) {
  if (getMemberIds(booking).length === 0) return true;
  const history = booking.assignmentHistory || [];
  const last = history[history.length - 1];
  return !!last && /^(Assigned automatically|Proposed again)/.test(last.reason || '');
}

// After the admin moves a request in the Pending queue, the proposals for the requests that share its date and time block are made
// again in queue order: a request higher in the queue keeps (or gets) its pair, a lower one is proposed whoever is left. Only the
// system's own proposals on Pending bookings are touched: an Approved booking, and a Pending one an admin assigned by hand, never
// change. When Pending bookings do not hold technicians (PENDING_HOLDS_SLOT off) the order has no effect on who is proposed, so
// nothing is redone. Returns the booking ids whose proposal was made again.
async function reproposeBlock(movedBookingId, changedBy) {
  if (!scheduling.PENDING_HOLDS_SLOT) return [];
  const moved = await Booking.findOne({ bookingId: movedBookingId }).select('date time');
  if (!moved) return [];
  const block = (await Booking.find({ status: BOOKING_STATUS.PENDING, date: moved.date, time: moved.time })
    .select('+queueRank +assignmentHistory')
    .populate('service'))
    .sort((a, b) => (a.queueRank || 0) - (b.queueRank || 0));
  const mine = block.filter(isSystemProposal);

  // Everyone's old proposal goes first, so that the order decides who gets whom.
  for (const booking of mine) {
    const previous = getAssignments(booking);
    if (previous.length === 0) continue;
    booking.assignments = [];
    booking.technician = undefined;
    await booking.save();
    await Booking.updateOne(
      { _id: booking._id },
      { $push: { assignmentHistory: buildHistoryEntry({ before: previous, after: [], changedBy, reason: 'The queue order changed, so the proposal was made again' }) } }
    );
  }
  for (const booking of mine) {
    await autoAssignNewBooking(booking, 'Proposed again after the queue order changed');
  }
  return mine.map((b) => b.bookingId);
}

const ASSIGN_RESPONSE_POPULATE = [
  { path: 'service' },
  { path: 'customer', select: 'name email phone clientType companyName representativeName' },
  { path: 'technician', select: 'name' },
  ...ASSIGNMENT_POPULATE,
];

// Admin: assign who does the job. Body: { assignments: [{ technicianId, helperId? }] }.
router.patch('/:bookingId/assign', auth, auditSpecs.assign, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const requested = req.body.assignments;
    if (!Array.isArray(requested) || requested.length === 0) {
      return res.status(400).json({ message: 'Choose a technician.' });
    }

    const reasonInput = readReason(req.body.reason);
    if (reasonInput.problem) return sendProblem(res, reasonInput.problem);

    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const result = await performAssignment(booking, requested, { changedBy: req.userId, reason: reasonInput.reason });
    if (result.error) {
      return res.status(result.error.status).json({
        message: result.error.message,
        ...(result.error.suggestedDates ? { suggestedDates: result.error.suggestedDates } : {}),
      });
    }

    const populated = await booking.populate(ASSIGN_RESPONSE_POPULATE);
    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Who was assigned to a booking over time. An admin sees who changed it and why. A technician on
// the booking sees only the people and the dates. Anyone else, customers included, is refused.
router.get('/:bookingId/assignment-history', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).select('+assignmentHistory');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const isAdmin = req.userRole === ROLE.ADMIN;
    if (!isAdmin && isHiddenFromTechnicians(booking)) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (!isAdmin && !getMemberIds(booking).includes(req.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const entries = booking.assignmentHistory || [];
    const users = await User.find({ _id: { $in: idsIn(entries) } }).select('name');
    const names = new Map(users.map((u) => [String(u._id), u.name]));
    res.json({ history: viewHistory(entries, names, { admin: isAdmin }) });
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: assign technician and/or review payment verification
router.patch('/:bookingId/admin-update', auth, auditSpecs.adminUpdate, async (req, res) => {
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

    // A cancelled booking cannot be edited, with one exception: it was cancelled while its down payment proof was still waiting, so the
    // admin may verify or reject that proof (and nothing else). A refund opens once the proof is verified.
    const checkingAfterCancel = booking.status === BOOKING_STATUS.CANCELLED && booking.paymentCheckAfterCancel === true
      && req.body.paymentStatus !== undefined
      && Object.keys(req.body).every((key) => ['paymentStatus', 'reason'].includes(key));
    if (booking.status === BOOKING_STATUS.CANCELLED && !checkingAfterCancel) {
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

    // The payment part of the request, checked before anything is changed: allowed values only, a proof to verify, a reason to
    // reject or reverse, the down payment before the balance (utils/paymentVerification.js).
    const paymentPlan = planPaymentChange(booking, { paymentStatus, balancePaymentStatus, balancePaid, reverse: req.body.reverse, reason: req.body.reason });
    if (paymentPlan.problem) return sendProblem(res, paymentPlan.problem);

    // Status rules. Admin can only approve a Pending booking or cancel one. In Progress
    // and Completed are set by the system alone: In Progress by the status job when the
    // time block starts, Completed when the technician submits the service report.
    const statusProblem = validateAdminStatusChange(booking.status, status);
    if (statusProblem) return sendProblem(res, statusProblem);

    // Technicians are assigned through PATCH /:bookingId/assign, which checks every
    // member for conflicts. This route no longer takes a single technician.
    if (technician !== undefined) {
      return res.status(400).json({ message: 'Assign technicians from the assignment panel instead.' });
    }

    // Distance/Mobilization Charges - admin-entered, not system-computed. Tracked
    // separately from the assignment below so we only notify the customer when the
    // saved amount actually changes, not on every admin-update touching this route.
    let chargeChanged = false;
    const chargesBefore = { distanceAdjustment: booking.distanceAdjustment || 0, mobilizationFee: booking.mobilizationFee || 0 };
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
    const instructionsBefore = booking.technicianInstructions || '';
    if (technicianInstructions !== undefined) {
      booking.technicianInstructions = technicianInstructions;
    }

    // When a Pending booking does not hold its technicians' time (constants/scheduling.js), two Pending
    // bookings can name the same technician, so the clash is checked at the moment of approval.
    if (!scheduling.PENDING_HOLDS_SLOT && status === BOOKING_STATUS.APPROVED && prev.status !== BOOKING_STATUS.APPROVED) {
      const clash = await findConflictingBooking(getMemberIds(booking), booking.date, booking.time, booking.bookingId);
      if (clash) {
        return res.status(409).json({
          message: `A technician on this job is already booked ${booking.date} (${booking.time}) on ${clash.bookingId}. Change the assignment before approving, or move the booking to a date when enough technicians are free.`,
          suggestedDates: await suggestionsFor(booking),
        });
      }
    }

    // Staffing rule from the paper: a booking cannot be approved until the technicians the service needs are
    // assigned. A Cleaning (or any pair service) needs a lead and a helper; only a check-up or survey may be solo.
    if (status === BOOKING_STATUS.APPROVED && prev.status !== BOOKING_STATUS.APPROVED) {
      const staffing = staffingProblem(getAssignments(booking), booking.service, 'approving');
      if (staffing) return res.status(400).json({ message: staffing, suggestedDates: await suggestionsFor(booking) });
    }

    // Admin-initiated cancellation opens the same refund request the customer's own
    // /cancel route would, and is bound by the same rule: only bookings still
    // Pending/Approved/In Progress can be cancelled (never a Completed one).
    let adminCancelOutcome = 'none';
    if (status === BOOKING_STATUS.CANCELLED) {
      if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
        return res.status(400).json({ message: 'This booking can no longer be cancelled.' });
      }
      adminCancelOutcome = openRefundIfEligible(booking);
    }

    // Admin Dashboard + Analytics Module: capture the first time this booking is
    // approved (for the "average response time" metric) - never overwritten on
    // later edits, so re-approving after a status change doesn't reset it.
    if (status === BOOKING_STATUS.APPROVED && !booking.approvedAt) {
      booking.approvedAt = new Date();
    }

    // Update status
    if (status) booking.status = status;
    if (status === BOOKING_STATUS.CANCELLED && prev.status !== BOOKING_STATUS.CANCELLED) {
      booking.cancelledAt = new Date();
      booking.cancelledBy = 'admin';
    }

    // ── Payments ── (verify, reject or reverse, one at a time). One conditional update with the expected old status in
    // the filter: if another admin got there first this one is refused and nothing else is saved or announced.
    if (paymentPlan.plan) {
      const actor = { id: req.userId, name: (await User.findById(req.userId).select('name'))?.name || '' };
      const committed = await commitPayment(
        Booking, booking,
        checkingAfterCancel ? { ...paymentPlan.plan, expect: { ...paymentPlan.plan.expect, paymentCheckAfterCancel: true } } : paymentPlan.plan,
        actor, new Date(), { allowCancelled: checkingAfterCancel }
      );
      if (!committed) {
        return res.status(409).json({ message: 'This payment was just changed by someone else, or the booking was cancelled. Reload and check its status.' });
      }
      // bring the document in step with what was saved, without writing it a second time
      [...Object.keys(paymentPlan.plan.set), ...paymentPlan.plan.unset, 'paymentEvents'].forEach((key) => {
        booking.set(key, committed.get(key));
        booking.unmarkModified(key);
      });
    }

    // The proof a cancelled booking was waiting on has been checked: a verified one opens the refund, a rejected one means nothing was
    // paid. Either way the booking no longer waits.
    let refundOpenedAfterCheck = false;
    if (checkingAfterCancel) {
      booking.paymentCheckAfterCancel = false;
      if (paymentPlan.plan && paymentPlan.plan.action === 'verify') refundOpenedAfterCheck = openRefundIfEligible(booking) === 'opened';
    }

    await booking.save();

    if (refundOpenedAfterCheck) {
      await notifyAdmins(
        NOTIFICATION_TYPE.REFUND_REQUESTED,
        `Booking ${booking.bookingId}: the down payment was verified after the booking was cancelled, so a refund request is waiting for review${booking.refund.isSameDay ? ' (same-day cancellation, deduction needed)' : ''}.`,
        { booking }
      );
    }

    // Technicians: the admin cancelled the booking, or edited the instructions (without repeating what they say).
    if (status === BOOKING_STATUS.CANCELLED && prev.status !== BOOKING_STATUS.CANCELLED) {
      await notifyMembersOfChange(booking, prev.status, NOTIFICATION_TYPE.BOOKING_CANCELLED, `Booking ${booking.bookingId} (${booking.date}, ${booking.time}) was cancelled. You no longer need to attend.`);
    } else if (technicianInstructions !== undefined
      && String(technicianInstructions || '').trim() !== String(instructionsBefore).trim()
      && [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
      await notifyMembersOfChange(booking, prev.status, NOTIFICATION_TYPE.INSTRUCTIONS_UPDATED, `The instructions for booking ${booking.bookingId} (${booking.date}, ${booking.time}) were updated. Open the job to read them.`);
    }

    // Customer notifications for what admin just did. Only on an actual change.
    if (status === BOOKING_STATUS.APPROVED && prev.status !== BOOKING_STATUS.APPROVED) {
      // The technicians on the job hear about it now, once, because it is only now visible to them.
      await notifyAssignedTechnicians(booking);
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
      if (adminCancelOutcome === 'awaiting-check') {
        await notifyAdmins(NOTIFICATION_TYPE.PAYMENT_SUBMITTED, `Booking ${booking.bookingId} was cancelled while its down payment proof is still waiting. Verify or reject the proof; a refund opens once it is verified.`, { booking });
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
        `Your ${balanceNowRejected && !downPaymentNowRejected ? 'balance ' : ''}payment proof for booking ${booking.bookingId} could not be verified: ${String(req.body.reason || '').trim()}.${booking.status === BOOKING_STATUS.CANCELLED ? '' : ' Please upload a new proof.'}`,
        { booking }
      );
    }

    // One message for the charges that changed, saying what happened to each (added, increased, lowered or removed).
    if (chargeChanged) {
      const message = describeChargeChanges({
        bookingId: booking.bookingId,
        before: chargesBefore,
        after: { distanceAdjustment: booking.distanceAdjustment || 0, mobilizationFee: booking.mobilizationFee || 0 },
        outsideArea: !isWithinServiceArea(booking.address),
      });
      if (message) await sendNotification(booking.customer, NOTIFICATION_TYPE.CHARGE_UPDATED, message, { booking });
    }

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: process a pending refund. Requires proof the money was actually sent back
// (same upload mechanism as customer proof-of-payment) before it can be marked
// Processed. Same-day cancellations also require a dispatch/transportation
// deduction before the refundable amount is finalized; pre-service cancellations
// refund the down payment in full.
router.patch('/:bookingId/refund', auth, auditSpecs.refundProcess, allowRoles(ROLE.ADMIN), upload.single('proof'), async (req, res) => {
  try {
    // A refused request must not leave its uploaded file behind.
    res.on('finish', () => { if (res.statusCode >= 400) discardUploads(req); });

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

    const amounts = resolveRefundAmounts({
      amountPaid: booking.refund.downPaymentAmount,
      isSameDay: booking.refund.isSameDay,
      dispatchDeduction: req.body.dispatchDeduction,
      finalAmount: req.body.finalAmount,
      reason: req.body.adjustmentReason,
    });
    if (amounts.problem) return sendProblem(res, amounts.problem);

    if (booking.refund.isSameDay) booking.refund.dispatchDeduction = Number(req.body.dispatchDeduction);
    booking.refund.refundableAmount = amounts.values.finalAmount;
    booking.refund.computedAmount = amounts.values.computedAmount;
    booking.refund.finalAmount = amounts.values.finalAmount;
    if (amounts.values.adjusted) {
      booking.refund.adjustmentReason = amounts.values.adjustmentReason;
      booking.refund.adjustedBy = req.userId;
      booking.refund.adjustedAt = new Date();
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
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Customer: confirm the refund money arrived. Once only; it never blocks the admin and does not
// touch a dispute flag.
router.patch('/:bookingId/refund/received', auth, allowRoles(ROLE.CUSTOMER), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.refund?.status !== REFUND_STATUS.PROCESSED) {
      return res.status(400).json({ message: 'This refund has not been processed yet.' });
    }
    if (booking.refund.receivedConfirmedAt) {
      return res.status(400).json({ message: 'You have already confirmed this refund.' });
    }

    booking.refund.receivedConfirmedAt = new Date();
    await booking.save();

    await notifyAdmins(
      NOTIFICATION_TYPE.REFUND_CONFIRMED,
      `The customer confirmed they received the refund of ₱${(booking.refund.refundableAmount || 0).toLocaleString()} for booking ${booking.bookingId}.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(customerBooking(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Customer: flag a refund that hasn't come through (e.g. marked Processed but
// never actually received). Single message + status, not a ticketing thread -
// admin just needs to see it and mark it addressed once followed up outside the system.
router.patch('/:bookingId/refund/flag', auth, allowRoles(ROLE.CUSTOMER), async (req, res) => {
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

    await notifyAdmins(NOTIFICATION_TYPE.REFUND_FLAGGED, `Booking ${booking.bookingId}: the customer says the refund has not come through: "${message.trim().slice(0, 100)}".`, { booking });

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(customerBooking(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: mark a customer's refund flag as addressed (followed up outside the
// system - a phone call, etc.) so it stops showing as needing attention.
router.patch('/:bookingId/refund/flag/resolve', auth, auditSpecs.refundFlagResolve, async (req, res) => {
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
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: reschedule a booking that had a disruption reported on it. This is the
// exact hook point Notification Sender was built for - both the client and the
// assigned technician are notified right away as part of this action.
router.patch('/:bookingId/disruption/reschedule', auth, auditSpecs.disruptionReschedule, async (req, res) => {
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

    // Two ways in: the lead already reported a disruption (its reason is on the booking), or the admin starts the
    // reschedule directly on an Approved or In Progress booking, without waiting for a report. The admin then gives the
    // reason, so the record says why the job moved.
    const technicianReported = booking.disruption?.status === 'Reported';
    const adminReason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!technicianReported) {
      if (![BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
        return res.status(400).json({ message: 'A disruption reschedule can only be started for an Approved or In Progress booking.' });
      }
      if (!adminReason) return res.status(400).json({ message: 'Say what happened: a reason is required to reschedule a disrupted job.' });
      if (adminReason.length > 300) return res.status(400).json({ message: 'The reason must be 300 characters or fewer.' });
    }

    if (!TIME_BLOCKS.includes(time)) {
      return res.status(400).json({ message: 'Time must be Morning or Afternoon.' });
    }

    const closedOnDisruption = await businessDayProblem(Closure, date);
    if (closedOnDisruption) return sendProblem(res, closedOnDisruption);

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
    const movedAt = new Date();
    if (technicianReported) {
      booking.disruption.status = 'Rescheduled';
      booking.disruption.initiatedBy = 'technician';
      booking.disruption.rescheduledAt = movedAt;
    } else {
      booking.disruption = { status: 'Rescheduled', reason: adminReason, reportedAt: movedAt, reportedBy: req.userId, initiatedBy: 'admin', rescheduledAt: movedAt };
    }
    // Extra days approved against the old schedule no longer fit the job, so they stop holding the technicians.
    booking.extensionDays = [];
    if (booking.extensionRequest?.status === 'Pending') booking.extensionRequest.status = 'Denied';

    await booking.save();

    const message = `Booking ${booking.bookingId} (${booking.service?.name || 'service'}) was interrupted and has been rescheduled to ${date}, ${time}.`;
    await sendNotification(booking.customer, NOTIFICATION_TYPE.DISRUPTION_RESCHEDULED, message, { booking });
    await notifyMembers(booking, NOTIFICATION_TYPE.DISRUPTION_RESCHEDULED, message);

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: approve a pending extension request - grants the extra day. Notifies the
// requesting technician and the client, whose completion timeline just changed.
router.patch('/:bookingId/extension/approve', auth, auditSpecs.extensionApprove, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.extensionRequest?.status !== 'Pending') {
      return res.status(400).json({ message: 'No pending extension request for this booking.' });
    }
    if ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status)) {
      return res.status(400).json({ message: 'This booking is already finished, so it cannot be extended.' });
    }

    // The day that was asked for, unless the admin picks another (a date and a time block in the body).
    const slot = await resolveExtensionSlot(booking, {
      date: req.body?.date || booking.extensionRequest.requestedDate,
      time: req.body?.time || booking.extensionRequest.requestedTime,
    });
    if (slot.error) return res.status(slot.error.status).json({ message: slot.error.message });

    // The extra day holds every technician on the job, so approving it must not double-book anyone. The clash
    // is returned so the admin can pick another date, move the other booking, or deny the request.
    const clash = await findConflictingBooking(getMemberIds(booking), slot.date, slot.time, booking.bookingId);
    if (clash) {
      return res.status(409).json({
        message: `A technician on this job is already booked ${slot.date} (${slot.time}) on ${clash.bookingId}. Choose another date for the extra day, change that booking, or deny the request.`,
        conflict: { bookingId: clash.bookingId, date: slot.date, time: slot.time },
      });
    }

    booking.extensionDays = [...(booking.extensionDays || []), { date: slot.date, time: slot.time, approvedBy: req.userId, approvedAt: new Date() }];
    booking.extensionRequest.status = 'Approved';
    booking.extensionRequest.requestedDate = slot.date;
    booking.extensionRequest.requestedTime = slot.time;
    booking.extensionRequest.decidedAt = new Date();
    booking.extensionRequest.decidedBy = req.userId;

    await booking.save();

    await notifyMembers(booking, NOTIFICATION_TYPE.EXTENSION_APPROVED, `The extension request for booking ${booking.bookingId} has been approved: you have an extra day on ${slot.date} (${slot.time}).`);
    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.EXTENSION_APPROVED,
      `Your technician requested an extra day to finish booking ${booking.bookingId}. This has been approved for ${slot.date} (${slot.time}), so completion will take a bit longer than originally scheduled.`,
      { booking }
    );

    const populated = await booking.populate([
      { path: 'service' },
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: deny a pending extension request. Notifies the requesting technician and the client.
router.patch('/:bookingId/extension/deny', auth, auditSpecs.extensionDeny, async (req, res) => {
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
      { path: 'customer', select: 'name email phone clientType companyName representativeName' },
      { path: 'technician', select: 'name' },
      ...ASSIGNMENT_POPULATE,
    ]);

    res.json(withWarranty(populated));
  } catch (err) {
    sendRouteError(res, err);
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