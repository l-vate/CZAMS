const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { ROLE } = require('../constants/roles');
const { REFUND_STATUS } = require('../constants/refundStatus');
const { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const { PAYMENT_MODE } = require('../constants/paymentModes');
const { BOOKING_STATUS, BOOKING_STATUS_VALUES } = require('../constants/bookingStatus');
const mongoose = require('mongoose');
const multer = require('multer');
const auditSpecs = require('../utils/auditSpecs');
const { recordAudit } = require('../utils/audit');
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');
const { withWarranty } = require('../utils/bookingView');
const { sendNotification, notifyAdmins } = require('../utils/notifications');
const Report = require('../models/Report');
const {
  getBookingBasePrice, getBookingUnitsSubtotal, getBookingGrossUnitsSubtotal, getBookingTotalQuantity,
  getSeniorDiscountAmount, getAppliedDiscount, getPaymentBreakdown, getVatAmount, PRICING_VERSION,
} = require('../utils/pricing');
const { approvalPaymentBlock } = require('../utils/paymentDue');
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
const { SENIOR_PWD_DISCOUNT_RATE, SENIOR_PWD_DISCOUNT_PERCENT } = require('../constants/discount');

const isTrue = (v) => v === true || v === 'true';
const COMMERCIAL_DISCOUNT_MESSAGE = 'The Senior Citizen and PWD discount is for residential customers only.';
const CONSENT_MESSAGE = 'Tick the box to agree that your ID will be viewed only to verify your discount.';
const { amountPaid } = require('../utils/customerHistory');
const { createUploader, discardUploads, storeUploads, PROOF_TYPES } = require('../utils/uploadSafety');
const { uploadLimiter, paymentLimiter, noShowLimiter } = require('../middleware/rateLimit');
const Notification = require('../models/Notification');
const { approvalProblem } = require('../utils/bookingLifecycle');
const { noShowAvailability, readNote, readDecisionReason, REPORTABLE_STATUSES } = require('../utils/noShow');
const { NO_SHOW_STATUS } = require('../constants/bookingLifecycle');
const { KINDS } = require('../storage/fileStore');
const { withLocks, LockBusyError } = require('../utils/slotLock');
const { duplicateKey, findActiveDuplicate, DuplicateBookingError } = require('../utils/duplicateBooking');
const { PendingLimitError, SlotTakenError, slotKey, pendingLimitKey, assertUnderPendingLimit, assertSlotOpen } = require('../utils/pendingHold');
const { manilaToday } = require('../utils/manilaDate');
const { bookingDateProblem } = require('../utils/dateRules');
const { readFeedback } = require('../utils/feedbackInput');
const { normalizeContactNumber } = require('../utils/contactNumber');
const { sendRouteError } = require('../utils/routeErrors');
const { planPaymentChange, planInPersonPayment, commitPayment } = require('../utils/paymentVerification');
const { describeChargeChanges } = require('../utils/chargeNotice');
const { buildPriceSnapshot } = require('../utils/priceSnapshot');
const { readPaging } = require('../utils/adminInput');
const { serviceProblem, unitsProblem } = require('../utils/bookingValidation');
const { downPaymentProblem, balanceProblem, onlinePaymentModeProblem, DOWN_PAYMENT_BOOKING_STATUSES, DOWN_PAYMENT_OPEN, BALANCE_BOOKING_STATUSES, BALANCE_OPEN } = require('../utils/paymentGuards');
const { nextQueueRank, reorder: reorderQueue, getQueue } = require('../utils/queue');
const { generateBookingId, createWithUniqueBookingId, BookingIdExhaustedError } = require('../utils/bookingId');
const { invalid, sendProblem } = require('../utils/validation');
const { readPaymentSubmission, findSameReference } = require('../utils/paymentReference');
const { readUnitBrand } = require('../utils/unitBrand');
const { readMayNeedWorks, describeMayNeedWorks } = require('../utils/mayNeedWorks');
const { readUnitChoices, brandModelOf, unitConfirmationProblem } = require('../utils/suppliedUnits');
const { startingQuotation, readSite } = require('../utils/quotation');
const SuppliedUnit = require('../models/SuppliedUnit');
const { resolveRefundAmounts } = require('../utils/refundAmounts');
const Closure = require('../models/Closure');
const { businessDayProblem } = require('../utils/businessDays');
const { nextWorkingDayKey, extensionSlotProblem, addDays } = require('../utils/extensionDays');
const {
  ASSIGNMENT_POPULATE, getMemberIds, getLeadIds, getPrimaryLeadId, getRoleFor,
  memberFilter, findConflictingBooking, getBusyTechnicianIds, findOffTechnicianIds, getAssignments, staffingProblem,
} = require('../utils/assignments');
const { readReason, buildHistoryEntry, viewHistory, idsIn } = require('../utils/assignmentHistory');
const { resolveClassification } = require('../utils/classification');

const { TIME_BLOCKS } = require('../utils/timeBlocks');

// Every route that returns a booking includes its computed warranty status (utils/bookingView.js).

// The same, for a customer: only the fields a customer may see (utils/customerView.js).
// It also carries whether the customer may report a no show right now (utils/noShow.js), so the button and the waiting note follow the server's own rule.
const customerBooking = (booking) => {
  const view = toCustomerView(withWarranty(booking));
  view.noShowAvailability = noShowAvailability(booking);
  return view;
};

// ============================================
// 1. CONFIGURATION & HELPERS
// ============================================

// Payment, ID, refund and purchase proofs: JPG, PNG, WEBP or PDF only, random stored name with an
// extension from the validated type, first bytes checked (utils/uploadSafety.js). A route writes the files to the file store
// with storeUploads once everything else has passed.
const upload = createUploader({
  allowedTypes: PROOF_TYPES,
});

// A customer's proof of payment is a JPG or PNG picture only (no WEBP, no PDF).
const PAYMENT_PROOF_TYPES = Object.freeze(['image/jpeg', 'image/png']);
const paymentUpload = createUploader({ allowedTypes: PAYMENT_PROOF_TYPES });
// For the booking form, whose one upload middleware also carries the ID photo: refuses a customer's `proof` that is not a JPG or PNG.
// An admin booking on a customer's behalf keeps the wider list.
const customerProofImagesOnly = (req, res, next) => {
  const proof = req.files?.proof?.[0];
  if (req.userRole === ROLE.CUSTOMER && proof && !PAYMENT_PROOF_TYPES.includes(proof.mimetype)) {
    discardUploads(req);
    return res.status(400).json({ message: 'Only JPG or PNG files are allowed.' });
  }
  return next();
};

// The booking date rule lives in utils/dateRules.js: a real date, not in the past, at least MIN_LEAD_DAYS ahead and no more than 5 calendar months
// ahead (Manila). bookingDateProblem returns the sentence to show, or null. Older note: a real YYYY-MM-DD date at least MIN_LEAD_DAYS (constants/scheduling.js) after today in Manila (utils/manilaDate.js),
// whatever time zone the server runs in.

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

// Today's date in Manila as YYYY-MM-DD, for comparing the day of a cancellation against booking.date.
const todayDateString = () => manilaToday();

// Opens a refund request on a booking that's about to be cancelled, but only if a
// down payment was actually on file (cleaning bookings with no down payment simply
// stay 'None'). Shared by the customer-initiated /cancel route and the admin-initiated
// /admin-update route so both cancellation paths open refunds the same way. Requires
// booking.service to already be populated (needed for the price).
// The down payment in pesos, from the booking's totals right now (units minus any applied discount,
// times the down payment percent).
function computeDownPaymentAmount(booking) {
  return getPaymentBreakdown(booking).downPayment;
}

// The reason an owner-initiated cancellation must carry: 3 to 200 characters. { problem } or { reason }.
function readOwnerCancelReason(raw) {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < 3 || reason.length > 200) {
    return { problem: invalid('Give a short reason (3 to 200 characters) for cancelling because we cannot supply or serve.') };
  }
  return { reason };
}

// The reason an admin gives for any other cancellation: 3 to 200 characters. { problem } or { reason }.
function readCancelNote(raw) {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < 3 || reason.length > 200) {
    return { problem: invalid('Give a short reason (3 to 200 characters) for cancelling.') };
  }
  return { reason };
}

// What an admin's cancellation carries: { problem }, or { ownerCancelled, reason } for the owner cancelling because it cannot supply or serve (a reason is
// required and the refund is full with no fee), or { reason } for any other cancellation that says why (Customer request, or a short text), or {} for one
// that does not. A reason changes no refund rule: it is only shown to the customer and written in the audit entry.
function readAdminCancelReason(ownerInitiated, cancelReason) {
  if (ownerInitiated === true) {
    const owner = readOwnerCancelReason(cancelReason);
    return owner.problem ? owner : { ...owner, ownerCancelled: true };
  }
  if (cancelReason === undefined || cancelReason === null || cancelReason === '') return {};
  return readCancelNote(cancelReason);
}

// Returns 'opened' when a refund request was opened, or 'none' when no down payment is on file. A customer who cancels can ask for a refund even
// while their down payment proof is still waiting to be verified: the request is opened and marked paymentUnverified. It is not paid out until
// the proof is verified, and the owner rejects it when the payment never came through.
function openRefundIfEligible(booking) {
  const unverified = booking.downPaymentPercent > 0 && booking.paymentStatus === PAYMENT_STATUS.TO_VERIFY;
  const hasDownPaymentOnFile =
    booking.downPaymentPercent > 0 &&
    [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus);

  if (!unverified && !hasDownPaymentOnFile) return 'none';
  if (unverified) booking.paymentCheckAfterCancel = true;

  // What the customer actually paid when they submitted it, else (older bookings) the current figure.
  const downPaymentAmount = typeof booking.downPaymentPaidAmount === 'number'
    ? booking.downPaymentPaidAmount
    : computeDownPaymentAmount(booking);
  // Decided on the server, from the Manila calendar day the booking was cancelled on (not the day an admin gets round to verifying
  // the proof). On or after the booked date a transportation fee applies (the stored flag is still called isSameDay, and it is true for
  // the booked day and for every day after it: a late cancellation or a no-show). Any earlier day is a full refund. Both dates are YYYY-MM-DD
  // Manila days, so comparing the text compares the days.
  // An owner-initiated cancellation (the owner cannot supply or cannot serve) is never late: the whole down payment goes back, no fee, on any date.
  const cancelledOn = booking.cancelledAt ? manilaTodayKey(new Date(booking.cancelledAt)) : todayDateString();
  const ownerInitiated = booking.ownerCancelled === true;
  const isSameDay = !ownerInitiated && cancelledOn >= booking.date;

  booking.refund = {
    status: 'Pending',
    isSameDay,
    ...(ownerInitiated ? { ownerInitiated: true, reason: booking.cancelReason } : {}),
    downPaymentAmount,
    ...(unverified ? { paymentUnverified: true } : {}),
    // On or after the booked date: the transportation fee isn't known until admin
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

// A technician's reviews, including the customer's name: an admin reads any technician's (Performance Review modal in Manage Accounts),
// a technician reads only their own (their dashboard). Nothing per-technician is public: the landing page only gets the company-wide
// aggregate (/public/feedback-summary).
router.get('/technicians/:id/feedback', auth, async (req, res) => {
  try {
    const own = req.userRole === ROLE.STAFF && String(req.params.id) === String(req.userId);
    if (req.userRole !== ROLE.ADMIN && !own) {
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
router.post('/', auth, allowRoles(ROLE.CUSTOMER, ROLE.ADMIN), uploadLimiter, (req, res, next) => {
  req.generatedBookingId = generateBookingId();
  next();
}, upload.fields([{ name: 'proof', maxCount: 1 }, { name: 'discountId', maxCount: 1 }]), customerProofImagesOnly, async (req, res) => {
  try {
    // A refused request must not leave its uploaded file behind.
    res.on('finish', () => { if (res.statusCode >= 400) discardUploads(req); });

    const {
      service, units: unitsRaw, problemDescription,
      date, time, technician, address,
      downPaymentPercent, paymentMode, paymentMode2, referenceNumber,
      customer, clientSuppliedUnit, unitWaiverAcknowledged, unitWaiverName, contactNumber,
      lastCleanedOver6MonthsAgo, isActivelyLeaking,
      poNumber, paymentTermsDays, discountType, discountConsent,
    } = req.body;

    // Payment terms are agreed by an admin, never sent by a customer: a customer's paymentTermsDays is ignored. Only an
    // admin booking a walk-in may give terms here, and they must be 7 to 10 days.
    if (req.userRole === ROLE.ADMIN && paymentTermsDays !== undefined && paymentTermsDays !== '' && paymentTermsDays !== null) {
      const days = Number(paymentTermsDays);
      if (!Number.isInteger(days) || days < 7 || days > 10) {
        return res.status(400).json({ message: 'Payment terms must be between 7 and 10 days.' });
      }
    }

    const dateProblem = bookingDateProblem(date);
    if (dateProblem) return res.status(400).json({ message: dateProblem });

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
    // what the customer chose for each unit entry from the supplied unit catalog (checked below, once the service is known)
    const suppliedChoices = units.map((u) => u.supplied);
    // The brand of every unit is required (chosen from the list, or typed after Other), and is kept on the unit entry.
    const brands = [];
    for (const u of units) {
      const read = readUnitBrand(u);
      if (read.problem) return sendProblem(res, read.problem);
      brands.push(read.brand);
    }
    units = units.map((u, i) => ({
      type: u.type,
      quantity: Number(u.quantity),
      brand: brands[i],
      brandModel: (typeof u.brandModel === 'string' && u.brandModel.trim().toLowerCase() !== 'other' && u.brandModel.trim()) || brands[i],
      hp: typeof u.hp === 'string' || typeof u.hp === 'number' ? String(u.hp).trim().slice(0, 10) : '',
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
    // Where the unit comes from must be stated for an Installation (it sets the warranty: 6 months for a Cooling Zone unit, 3 for the customer's own).
    const isInstallationService = serviceDoc?.serviceType === SERVICE_TYPE.INSTALLATION;
    if (isInstallationService && !['true', 'false', true, false].includes(clientSuppliedUnit)) {
      return res.status(400).json({ message: 'Choose where the unit comes from: bought from Cooling Zone, or your own unit.' });
    }
    const isClientSuppliedUnit = clientSuppliedUnit === 'true' || clientSuppliedUnit === true;
    const isWaiverAcknowledged = unitWaiverAcknowledged === 'true' || unitWaiverAcknowledged === true;
    if (isClientSuppliedUnit && (!isWaiverAcknowledged || !unitWaiverName?.trim())) {
      return res.status(400).json({
        message: 'A signed waiver is required when the client supplies their own unit.'
      });
    }

    // The optional "I may need these works" checklist (a heads-up for the owner; it never changes the price).
    const worksInput = readMayNeedWorks(req.body.mayNeedWorks);
    if (worksInput.problem) return sendProblem(res, worksInput.problem);

    // Site details (optional): the building, the floor or room, and who to ask for.
    const siteInput = readSite({ building: req.body.siteBuilding, floorRoom: req.body.siteFloorRoom, attention: req.body.siteAttention });
    if (siteInput.problem) return sendProblem(res, siteInput.problem);

    // An Installation with a Cooling Zone unit: every unit entry must name a unit from the catalog (active, and the same type and
    // horsepower), or ask the owner when it is not listed. The unit's brand, model, price and so on are copied onto the booking now.
    // A customer's own unit keeps the waiver path above and carries no supplied unit.
    const unitChoices = await readUnitChoices({
      units,
      choices: suppliedChoices,
      needsChoice: isInstallationService && !isClientSuppliedUnit,
      findItem: (id) => (mongoose.isValidObjectId(id) ? SuppliedUnit.findById(id) : null),
      findMatches: (unit) => SuppliedUnit.find({ type: unit.type, isDeleted: { $ne: true }, isActive: { $ne: false } }),
    });
    if (unitChoices.problem) return sendProblem(res, unitChoices.problem);
    units = units.map((u, i) => (unitChoices.supplied[i]
      ? { ...u, supplied: unitChoices.supplied[i], brandModel: brandModelOf({ ...u, supplied: unitChoices.supplied[i] }) || u.brandModel }
      : u));

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
    // A customer pays online by GCash or Bank Transfer only, for the first and the second payment, whatever the form offers. An admin
    // walk-in may record any mode.
    if (req.userRole !== ROLE.ADMIN) {
      const modeProblem = onlinePaymentModeProblem(paymentMode) || onlinePaymentModeProblem(paymentMode2);
      if (modeProblem) return sendProblem(res, modeProblem);
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

    // A customer's installation is confirmed by our team first, so no payment comes with it: the down payment is sent later from Billing.
    if (req.userRole === ROLE.CUSTOMER && isInstallationService && (req.files?.proof?.[0] || String(referenceNumber || '').trim())) {
      discardUploads(req);
      return res.status(400).json({ message: 'An installation has to be confirmed by our team first. You can send the down payment once it is confirmed.' });
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

    // Senior Citizen / PWD discount request. A customer must always attach a photo of a valid ID, and the discount stays Pending until
    // an admin approves it. An admin booking on someone's behalf (walk-in) has seen the ID in person: it is applied on the spot and the
    // ID upload is optional.
    const discountIdFile = req.files?.discountId?.[0];
    const discountIdPath = discountIdFile ? `/uploads/proofs/${discountIdFile.filename}` : undefined;
    const isDiscountRequested = discountType === 'Senior' || discountType === 'PWD';
    if (discountType && !isDiscountRequested) {
      return res.status(400).json({ message: 'Choose either Senior Citizen or PWD for the discount.' });
    }
    if (discountIdFile && !isDiscountRequested) {
      return res.status(400).json({ message: 'Choose Senior Citizen or PWD to go with the ID you uploaded.' });
    }
    // Residential customers only: a Commercial account cannot have the discount, whoever asks for it.
    if (isDiscountRequested && isCommercial) {
      return res.status(400).json({ message: COMMERCIAL_DISCOUNT_MESSAGE });
    }
    if (isDiscountRequested && !isAdminWalkIn && !discountIdFile) {
      return res.status(400).json({ message: 'Upload a photo of a valid ID to request the Senior Citizen / PWD discount.' });
    }
    // A customer must agree that the ID is viewed only to verify the discount. The agreement is recorded with its time.
    if (isDiscountRequested && !isAdminWalkIn && !isTrue(discountConsent)) {
      return res.status(400).json({ message: CONSENT_MESSAGE });
    }
    const now = new Date();
    let discount;
    if (isDiscountRequested) {
      discount = isAdminWalkIn
        ? {
            type: discountType, idFile: discountIdPath, status: 'Approved',
            percent: SENIOR_PWD_DISCOUNT_PERCENT, rate: SENIOR_PWD_DISCOUNT_RATE,
            dpPaidBeforeApproval: 0, requestedAt: now, reviewedAt: now, reviewedBy: req.userId,
          }
        : { type: discountType, idFile: discountIdPath, status: 'Pending', requestedAt: now, consentGiven: true, consentAt: now };
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

    // Everything has passed. The check for an identical booking and the insert happen while holding one lock (utils/slotLock.js), so
    // two copies sent at the same moment (a double click) take turns: the second sees the first and is refused. The files are written
    // to the store only once the booking is certain to be made, and removed again if it cannot be saved.
    // A customer's Pending bookings hold their slot, first come first served, and are capped. Both checks run under their own lock (one
    // for the slot, one for the customer) so two requests at the same moment cannot both pass. An admin booking a walk-in decides for
    // themselves and is not held to either.
    const holdKeys = isAdminWalkIn || req.userRole === ROLE.ADMIN ? [] : [slotKey(date, time), pendingLimitKey(bookingCustomerId)];
    const booking = await withLocks([duplicateKey({ customer: bookingCustomerId, date, time, service }), ...holdKeys], async () => {
      if (await findActiveDuplicate(Booking, { customer: bookingCustomerId, date, time, service, units })) throw new DuplicateBookingError();
      if (holdKeys.length > 0) {
        await assertUnderPendingLimit(Booking, bookingCustomerId);
        await assertSlotOpen(date, time);
      }
      await storeUploads(req, { kind: (file) => (file.fieldname === 'discountId' ? KINDS.ID_PHOTO : KINDS.PROOF), bookingId: req.generatedBookingId });
      const queueRank = await nextQueueRank(); // last in line: first come, first served
      return createWithUniqueBookingId((bookingId) => Booking.create({
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
        // an Installation starts with the standard duration and exclusions (utils/quotation.js); the admin can change them per booking
        quotation: isInstallationService ? startingQuotation(serviceDoc.serviceType) : undefined,
        site: Object.values(siteInput.site).some(Boolean) ? siteInput.site : undefined,
        mayNeedWorks: worksInput.value,
        serviceAreaCheck: { withinArea: withinServiceArea, checkedAt: new Date() },
        cleaningTierAnswers: (isCleaningService && (lastCleanedOver6MonthsAgo !== undefined || isActivelyLeaking !== undefined)) ? {
          lastCleanedOver6MonthsAgo: lastCleanedOver6MonthsAgo === 'true' || lastCleanedOver6MonthsAgo === true,
          isActivelyLeaking: isActivelyLeaking === 'true' || isActivelyLeaking === true,
        } : undefined,
        isCommercial,
        pricingVersion: PRICING_VERSION,
        poNumber: isCommercial ? (String(poNumber ?? '').trim().slice(0, 40) || null) : null,
        paymentTermsDays: termsDays,
        ...(discount ? { discount } : {}),
      }), { firstId: req.generatedBookingId });
    });

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
    if (isCommercial) populated.vatAmount = getVatAmount(populated);
    // A proof sent with the booking fixes the down payment at what the booking came to now. It is still waiting to be verified, and the
    // amount only becomes a payment on file when an admin verifies it.
    const proofSentWithBooking = paymentStatus === PAYMENT_STATUS.TO_VERIFY;
    if (proofSentWithBooking) populated.downPaymentPaidAmount = getPaymentBreakdown(populated).downPayment;
    if (isCommercial || discountApprovedNow || bestPromo || proofSentWithBooking) {
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
        `New booking ${populated.bookingId} for ${populated.service?.name || 'a service'} on ${populated.date}, ${populated.time}${bookingCustomer?.name ? ` from ${bookingCustomer.name}` : ''}.${worksInput.value ? ` The customer may need: ${describeMayNeedWorks(worksInput.value)}. Send a quotation if it applies.` : ''}`,
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
    if (err instanceof DuplicateBookingError) return res.status(409).json({ message: err.message });
    if (err instanceof PendingLimitError) return res.status(400).json({ message: err.message });
    if (err instanceof SlotTakenError) return res.status(409).json({ message: err.message });
    if (err instanceof LockBusyError) return res.status(503).json({ message: err.message });
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

    const enriched = bookings.map((b) => withWarranty(b));
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

    res.json(customerBooking(booking));
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

    // A booking the day start job started by itself (nobody is known to be on site) can still be cancelled until the job is done, under the
    // usual rule: before the booked date a full refund, on or after it a fee. One that started any other way, and one with a no show report
    // waiting for the owner, cannot be cancelled online.
    const autoStarted = booking.status === BOOKING_STATUS.IN_PROGRESS && booking.startedBySystem === true && booking.reportSubmitted !== true;
    if (booking.noShow && booking.noShow.status === NO_SHOW_STATUS.REPORTED) {
      return res.status(400).json({ message: 'Your no show report is being reviewed by the owner, so this booking cannot be cancelled online right now.' });
    }
    if (booking.status === BOOKING_STATUS.IN_PROGRESS && !autoStarted) {
      return res.status(400).json({ message: 'This booking is already in progress and can no longer be cancelled online. Please contact us directly.' });
    }
    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
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

    // The customer gets a confirmation too, so the cancellation shows in their own notifications.
    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.BOOKING_CANCELLED,
      `You cancelled booking ${booking.bookingId}.${booking.refund?.status === REFUND_STATUS.PENDING ? ' A refund request for your down payment has been opened and is being reviewed.' : ''}`,
      { booking }
    ).catch((err) => console.error('Could not confirm the cancellation to the customer:', err.message));

    // Every admin is told once: with a refund waiting, the refund notice already says the booking was cancelled; otherwise a
    // plain cancellation notice.
    if (booking.refund?.status === REFUND_STATUS.PENDING) {
      await notifyAdmins(
        NOTIFICATION_TYPE.REFUND_REQUESTED,
        `Booking ${booking.bookingId} was cancelled by the customer and a refund request is waiting for review${booking.refund.isSameDay ? ' (cancelled on or after the booked date, transportation fee needed)' : ''}.${booking.refund.paymentUnverified ? ' Its down payment has not been verified yet: check whether the payment came through, then process the refund or reject it.' : ''}`,
        { booking }
      );
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
router.patch('/:bookingId/pay', auth, allowRoles(ROLE.CUSTOMER), paymentLimiter, uploadLimiter, paymentUpload.single('proof'), async (req, res) => {
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

    await storeUploads(req, { kind: KINDS.PROOF, bookingId: booking.bookingId });
    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        customer: req.userId,
        status: { $in: DOWN_PAYMENT_BOOKING_STATUSES },
        paymentStatus: { $in: DOWN_PAYMENT_OPEN },
      },
      { $set: {
        paymentStatus: PAYMENT_STATUS.TO_VERIFY,
        // the amount the customer was asked to pay stays what it was when they sent it, whatever the total does afterwards
        downPaymentPaidAmount: getPaymentBreakdown(booking).downPayment,
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
router.patch('/:bookingId/pay-balance', auth, allowRoles(ROLE.CUSTOMER), paymentLimiter, uploadLimiter, paymentUpload.single('proof'), async (req, res) => {
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

    await storeUploads(req, { kind: KINDS.PROOF, bookingId: booking.bookingId });
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
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).select('bookingId referenceNumber balanceReferenceNumber paymentMode paymentMode2');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ duplicates: await findSameReference(Booking, booking) });
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Customer: ask for the Senior Citizen / PWD discount on a booking they already made. Same ID
// upload and same admin approval flow as asking at booking time. Allowed while the booking is
// Pending or Approved, and only if there is no request yet or the last one was rejected.
router.patch('/:bookingId/discount/request', auth, allowRoles(ROLE.CUSTOMER), uploadLimiter, upload.single('discountId'), async (req, res) => {
  try {
    // A refused request must not leave its uploaded file behind.
    res.on('finish', () => { if (res.statusCode >= 400) discardUploads(req); });

    const { discountType, discountConsent } = req.body;
    if (discountType !== 'Senior' && discountType !== 'PWD') {
      return res.status(400).json({ message: 'Choose either Senior Citizen or PWD for the discount.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Upload a photo of a valid ID to request the Senior Citizen / PWD discount.' });
    }
    if (!isTrue(discountConsent)) {
      return res.status(400).json({ message: CONSENT_MESSAGE });
    }

    const booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.isCommercial) return res.status(400).json({ message: COMMERCIAL_DISCOUNT_MESSAGE });

    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED].includes(booking.status)) {
      return res.status(400).json({ message: 'A discount can only be requested while the booking is Pending or Approved.' });
    }
    if (['Pending', 'Approved'].includes(booking.discount?.status)) {
      return res.status(400).json({ message: 'This booking already has a discount request.' });
    }

    await storeUploads(req, { kind: KINDS.ID_PHOTO, bookingId: booking.bookingId });
    const askedAt = new Date();
    booking.discount = { type: discountType, idFile: `/uploads/proofs/${req.file.filename}`, status: 'Pending', requestedAt: askedAt, consentGiven: true, consentAt: askedAt };
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

    // The rate is the owner's fixed answer (constants/discount.js), frozen on the booking.
    const percent = SENIOR_PWD_DISCOUNT_PERCENT;

    // What the customer has already paid and an admin verified, at full price (computed before the discount is switched on). The paid
    // amount is never touched: only the balance goes down. A verified down payment on file is what was really paid; an older booking
    // without one falls back to the percentage of the full price.
    const downPaymentVerified = [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus);
    const dpPaid = downPaymentVerified
      ? (typeof booking.downPaymentPaidAmount === 'number'
        ? booking.downPaymentPaidAmount
        : Math.round(getBookingUnitsSubtotal(booking) * ((booking.downPaymentPercent || 0) / 100)))
      : 0;
    const alreadyPaid = Math.max(dpPaid, amountPaid(booking));

    booking.discount.status = 'Approved';
    booking.discount.percent = percent;
    booking.discount.rate = SENIOR_PWD_DISCOUNT_RATE;
    booking.discount.dpPaidBeforeApproval = dpPaid;
    booking.discount.rejectionReason = undefined;
    booking.discount.reviewedAt = new Date();
    booking.discount.reviewedBy = req.userId;
    booking.discount.amount = getSeniorDiscountAmount(booking);

    // The new total may not fall below what was already paid: that difference is money to give back, which goes through the refund
    // flow, not through a discount. Nothing has been saved yet.
    if (alreadyPaid > 0 && getBookingBasePrice(booking) < alreadyPaid) {
      const discountedTotal = getBookingBasePrice(booking);
      // put the request back as it was, so nothing half-applied is left on the document
      booking.discount.status = 'Pending';
      booking.discount.percent = undefined;
      booking.discount.rate = undefined;
      booking.discount.amount = undefined;
      booking.discount.dpPaidBeforeApproval = undefined;
      booking.discount.reviewedAt = undefined;
      booking.discount.reviewedBy = undefined;
      return res.status(400).json({
        message: `The customer has already paid ₱${alreadyPaid.toLocaleString()}, which is more than the discounted total of ₱${discountedTotal.toLocaleString()}. The discount cannot be applied. Handle the difference through the refund flow instead.`,
      });
    }

    if (booking.isCommercial) {
      booking.vatAmount = getVatAmount(booking);
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
router.patch('/:bookingId/unit-purchase-proof', auth, auditSpecs.unitPurchaseProof, allowRoles(ROLE.ADMIN), uploadLimiter, upload.single('proof'), async (req, res) => {
  try {
    // A refused request must not leave its uploaded file behind.
    res.on('finish', () => { if (res.statusCode >= 400) discardUploads(req); });

    if (req.userRole !== ROLE.ADMIN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'A proof-of-purchase file is required.' });
    }

    if (!(await Booking.findOne({ bookingId: req.params.bookingId }))) return res.status(404).json({ message: 'Booking not found' });

    await storeUploads(req, { kind: KINDS.PURCHASE_PROOF, bookingId: req.params.bookingId });
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

    const dateProblem = bookingDateProblem(date);
    if (dateProblem) return res.status(400).json({ message: dateProblem });

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
      // The date changes straight away, if the new slot is still free (a Pending booking holds its slot, first come first served; the
      // check and the save happen under the slot's lock). Whoever was proposed for the old date is dropped and proposed again below.
      await withLocks([slotKey(date, time)], async () => {
        await assertSlotOpen(date, time, booking.bookingId);
        booking.date = date;
        booking.time = time;
        booking.rescheduleRequest = { requestedDate: null, requestedTime: null, status: 'None' };
        await booking.save();
      });
      await booking.populate('service');
      await repropose(booking, req.userId);
      const populated = await booking.populate(populateAfter);
      return res.json(customerBooking(populated));
    }

    // Approved: the new slot must be free too, so the admin is not asked about a slot someone else already holds.
    await assertSlotOpen(date, time, booking.bookingId);

    // One open request per booking. The status check is part of the update, so two requests at once cannot both pass.
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
    if (err instanceof SlotTakenError) return res.status(409).json({ message: err.message });
    if (err instanceof LockBusyError) return res.status(503).json({ message: err.message });
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
      return res.status(403).json({ message: 'Only the primary technician of this job can report a disruption. Please tell them.' });
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
      return res.status(403).json({ message: 'Only the primary technician of this job can request an extension. Please tell them.' });
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

    const enriched = bookings.map((b) => withWarranty(b));
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
    const dateProblem = bookingDateProblem(date);
    if (dateProblem) return res.status(400).json({ message: dateProblem });
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

  // Hard block, per member, so the message can name who is the problem. The check and the save happen while holding a lock for each
  // technician in this slot (utils/slotLock.js): two requests for the same technician at the same moment take turns, so the second one
  // sees the first one's booking and is refused instead of double booking the slot.
  const before = new Set(getMemberIds(booking));
  const previousAssignments = getAssignments(booking);
  let blocked = null;
  await withLocks([...seen].map((id) => `tech:${id}|${booking.date}|${booking.time}`), async () => {
    for (const id of seen) {
      const [off] = await findOffTechnicianIds([id], booking.date, booking.time);
      if (off) {
        const who = await User.findById(id).select('name');
        blocked = {
          error: {
            status: 409,
            message: `${who?.name || 'A technician'} is not available ${booking.date} (${booking.time}). Choose a different technician, or move the booking to another date.`,
            suggestedDates: await suggestionsFor(booking),
          },
        };
        return;
      }
      const conflict = await findConflictingBooking([id], booking.date, booking.time, booking.bookingId);
      if (conflict) {
        const who = await User.findById(id).select('name');
        blocked = {
          error: {
            status: 409,
            message: `${who?.name || 'A technician'} is already booked ${booking.date} (${booking.time}) on ${conflict.bookingId}. Choose a different technician, or move the booking to a date when enough technicians are free.`,
            suggestedDates: await suggestionsFor(booking),
          },
        };
        return;
      }
    }
    booking.assignments = resolved;
    booking.technician = resolved[0].lead;
    booking.needsReassignment = false; // whoever is on it now is active (only active field technicians can be assigned)
    await booking.save();

    // The trail of who was on the job. Appended on the first assignment and on every change after.
    await Booking.updateOne(
      { _id: booking._id },
      { $push: { assignmentHistory: buildHistoryEntry({ before: previousAssignments, after: resolved, changedBy, reason }) } }
    );
  });
  if (blocked) return blocked;

  // Tell technicians who are newly on the job, and those who were taken off it. Nothing is sent while the
  // booking is Pending: technicians hear about the job when the admin approves it (notifyAssignedTechnicians).
  if (isHiddenFromTechnicians(booking)) return { ok: true };
  const after = new Set(getMemberIds(booking));
  const when = `${booking.date}, ${booking.time}`;
  for (const id of after) {
    if (!before.has(id)) {
      await sendNotification(id, NOTIFICATION_TYPE.JOB_ASSIGNED, `You were assigned to booking ${booking.bookingId} (${booking.service?.name || 'service'}) for ${when}.`, { booking });
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
      await sendNotification(id, NOTIFICATION_TYPE.JOB_ASSIGNED, `You were assigned to booking ${booking.bookingId} (${booking.service?.name || 'service'}) for ${when}.`, { booking });
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
    // If someone else took the technicians between the proposal and the save (two bookings made at the same moment), propose again: the
    // second look sees the first booking and chooses someone who is still free, or nobody.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const proposal = await proposeAssignment(booking);
      if (!proposal.assignment) return { suggestedDates: proposal.suggestedDates || [] };
      const result = await performAssignment(booking, [proposal.assignment], { reason });
      if (!result || !result.error) {
        await booking.populate(ASSIGNMENT_POPULATE);
        return { suggestedDates: [] };
      }
      if (result.error.status !== 409) break;
      if (attempt === 2) return { suggestedDates: result.error.suggestedDates || [] };
    }
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
      distanceAdjustment, mobilizationFee, unitSource, ownerInitiated, cancelReason,
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
    // A Pending booking whose service day has started can no longer be approved: the day start job cancels it (utils/bookingLifecycle.js).
    // An urgent booking entered on or after its own day is the one exception, and stays approvable during that day.
    if (status === BOOKING_STATUS.APPROVED && booking.status === BOOKING_STATUS.PENDING) {
      const tooLate = approvalProblem(booking);
      if (tooLate) return sendProblem(res, invalid(tooLate, 409));
    }
    // A unit the customer asked for that is not in the catalog must be settled by the owner first (a catalog unit, a unit price with a note,
    // or declined), so a booking is never approved at a price nobody has confirmed.
    if (status === BOOKING_STATUS.APPROVED && booking.status !== BOOKING_STATUS.APPROVED) {
      const unitProblem = unitConfirmationProblem(booking.units);
      if (unitProblem) return sendProblem(res, unitProblem);
      if (booking.unitDecline && booking.unitDecline.reason) {
        return sendProblem(res, invalid('The owner said this unit cannot be supplied. Withdraw that first, or cancel the booking.', 409));
      }
      // The down payment has to be paid (and verified) before a booking is approved. A booking with no down payment due is the exception.
      // The reason is worded for the admin (utils/paymentDue.js), the same sentence their booking screen shows beside the disabled Approve button.
      const block = approvalPaymentBlock(paymentStatus ? { ...booking.toObject(), service: booking.service, paymentStatus } : booking);
      if (block) {
        return sendProblem(res, invalid(`The down payment has to be paid and verified before this booking can be approved. ${block.message}`, 409));
      }
    }

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
    if (distanceAdjustment !== undefined && (booking.scopeLines || []).some((l) => l.kind === 'distance')
      && Number(distanceAdjustment) !== (booking.distanceAdjustment || 0)) {
      // the distance based charge is the booking's distance line(s) in the scope of works; changing the field here would count it twice
      return res.status(400).json({ message: 'This booking has a distance line in its scope of works. Change that line instead of the distance based charge.' });
    }
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

    // Where an Installation unit came from. Admin only, and only on an Installation; the warranty window follows it.
    if (unitSource !== undefined) {
      if (!['company', 'customer'].includes(unitSource)) {
        return res.status(400).json({ message: 'The unit source must be company or customer.' });
      }
      if (booking.service?.serviceType !== SERVICE_TYPE.INSTALLATION) {
        return res.status(400).json({ message: 'The unit source only applies to an Installation booking.' });
      }
      booking.clientSuppliedUnit = unitSource === 'customer';
      // The customer's own unit is not bought from Cooling Zone: no supplied unit (and no price for one) stays on the booking.
      if (booking.clientSuppliedUnit && booking.units.some((u) => u.supplied)) {
        booking.units.forEach((u) => { u.supplied = undefined; });
      }
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
    // assigned. A Cleaning (or any other service that needs two) needs at least two technicians; only a check-up or survey may have one.
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
      // The owner cancelling because it cannot supply the unit or cannot serve: a reason is required, and the refund is full with no fee.
      const given = readAdminCancelReason(ownerInitiated, cancelReason);
      if (given.problem) return sendProblem(res, given.problem);
      if (given.ownerCancelled) booking.ownerCancelled = true;
      if (given.reason) booking.cancelReason = given.reason;
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

    // The proof a cancelled booking was waiting on has been checked. A verified one lets the refund that was already asked for go ahead; a
    // rejected one means the payment never came through, so the refund request is rejected with that reason.
    let refundReadyAfterCheck = false;
    let refundRejectedAfterCheck = false;
    if (checkingAfterCancel) {
      booking.paymentCheckAfterCancel = false;
      if (booking.refund?.status === REFUND_STATUS.PENDING && booking.refund.paymentUnverified) {
        if (paymentPlan.plan && paymentPlan.plan.action === 'verify') {
          booking.refund.paymentUnverified = false;
          refundReadyAfterCheck = true;
        } else if (paymentPlan.plan && paymentPlan.plan.action === 'reject') {
          booking.refund.status = REFUND_STATUS.REJECTED;
          booking.refund.paymentUnverified = false;
          booking.refund.rejectedAt = new Date();
          booking.refund.rejectedBy = req.userId;
          booking.refund.rejectionReason = 'The payment did not go through, so there is nothing to refund.';
          refundRejectedAfterCheck = true;
        }
      } else if (paymentPlan.plan && paymentPlan.plan.action === 'verify') {
        refundReadyAfterCheck = openRefundIfEligible(booking) === 'opened';
      }
    }

    await booking.save();

    if (refundReadyAfterCheck && booking.refund?.status === REFUND_STATUS.PENDING) {
      await notifyAdmins(
        NOTIFICATION_TYPE.REFUND_REQUESTED,
        `Booking ${booking.bookingId}: the down payment was verified after the booking was cancelled, so its refund request is ready for review${booking.refund.isSameDay ? ' (cancelled on or after the booked date, transportation fee needed)' : ''}.`,
        { booking }
      );
    }
    if (refundRejectedAfterCheck) {
      await sendNotification(
        booking.customer,
        NOTIFICATION_TYPE.REFUND_REJECTED,
        `Your refund request for booking ${booking.bookingId} was not approved: the payment did not go through, so there is nothing to refund.`,
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
        booking.ownerCancelled
          ? `Your booking ${booking.bookingId} was cancelled by our team because we cannot supply or serve it: ${booking.cancelReason}.${booking.refund?.status === REFUND_STATUS.PENDING ? ' Your whole down payment will be refunded, with no transportation fee.' : ''}`
          : `Your booking ${booking.bookingId} was cancelled by our team.${refundNote}`,
        { booking }
      );
      if (booking.refund?.status === REFUND_STATUS.PENDING) {
        await notifyAdmins(
          NOTIFICATION_TYPE.REFUND_REQUESTED,
          `Booking ${booking.bookingId} was cancelled and a refund request is waiting for review${booking.refund.isSameDay ? ' (cancelled on or after the booked date, transportation fee needed)' : ''}.`,
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
// Processed. A cancellation on or after the booked date also requires a transportation
// deduction before the refundable amount is finalized; pre-service cancellations
// refund the down payment in full.
// ============================================
// A technician no show (utils/noShow.js). The customer reports it; the admin decides. A report refunds nothing by itself and creates no rating
// or score for any technician.
// ============================================
const NO_SHOW_WHY = {
  status: 'A no show can only be reported on a booking that is Approved or In Progress.',
  report: 'You already reported a no show for this booking.',
  filed: 'A service report was already filed for this booking.',
  date: 'A no show can only be reported on the service day.',
};

// Writes the given fields onto the booking's noShow record one by one (a nested path, so each one is set on its own).
function setNoShow(booking, fields) {
  Object.entries(fields).forEach(([key, value]) => { booking.noShow[key] = value; });
}

// An in-app note (no email) to every technician on the job.
async function noteMembers(booking, type, message) {
  try {
    await Promise.all(getMemberIds(booking).map((id) => Notification.create({ user: id, type, message, relatedBooking: booking._id, relatedBookingId: booking.bookingId })));
  } catch (err) {
    console.error(`Could not note the technicians on booking ${booking.bookingId}:`, err.message);
  }
}

// Customer: report that the technicians did not come. Only the owner of the booking, one report per booking.
router.patch('/:bookingId/no-show', auth, allowRoles(ROLE.CUSTOMER), noShowLimiter, auditSpecs.noShowReport, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId, customer: req.userId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const given = readNote(req.body && req.body.note);
    if (given.problem) return sendProblem(res, invalid(given.problem));
    const now = new Date();
    const availability = noShowAvailability(booking, now);
    if (!availability.canReport) {
      const message = availability.reason === 'wait' ? `You can report a no show from ${availability.waitUntil} on the service day.` : NO_SHOW_WHY[availability.reason];
      return res.status(availability.reason === 'report' ? 409 : 400).json({ message });
    }
    // one conditional write: two reports at the same moment cannot both pass
    const claimed = await Booking.findOneAndUpdate(
      { _id: booking._id, customer: req.userId, status: { $in: REPORTABLE_STATUSES }, reportSubmitted: { $ne: true }, $or: [{ 'noShow.status': { $exists: false } }, { 'noShow.status': NO_SHOW_STATUS.NONE }] },
      { $set: { noShow: { status: NO_SHOW_STATUS.REPORTED, note: given.note, reportedAt: now, reportedBy: String(req.userId) } } },
      { returnDocument: 'after' }
    );
    if (!claimed) return res.status(409).json({ message: NO_SHOW_WHY.report });
    await noteMembers(claimed, NOTIFICATION_TYPE.NO_SHOW_REPORTED, `The customer on booking ${claimed.bookingId} (${claimed.date}, ${claimed.time}) reported that the technicians did not come. The owner will review it.`);
    await notifyAdmins(NOTIFICATION_TYPE.NO_SHOW_REPORTED, `The customer on booking ${claimed.bookingId} (${claimed.date}, ${claimed.time}) reported that the technicians did not come. Please review it today.`, { booking: claimed });
    const populated = await claimed.populate([{ path: 'service' }, { path: 'technician', select: 'name' }, ...ASSIGNMENT_POPULATE]);
    res.json(customerBooking(populated));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Admin: decide a no show report. confirm = cancel as the owner (full refund of the verified down payment, no fee, the reason stored);
// reschedule = move it to a new date and time at no charge, payments stay in place; reject = the booking continues. A reason is required.
router.patch('/:bookingId/no-show/decision', auth, allowRoles(ROLE.ADMIN), auditSpecs.noShowDecision, async (req, res) => {
  try {
    const { action, date, time } = req.body || {};
    if (!['confirm', 'reschedule', 'reject'].includes(action)) return sendProblem(res, invalid('Choose confirm, reschedule or reject.'));
    const given = readDecisionReason(req.body.reason);
    if (given.problem) return sendProblem(res, invalid(given.problem));
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!booking.noShow || booking.noShow.status !== NO_SHOW_STATUS.REPORTED) {
      return res.status(409).json({ message: 'There is no open no show report on this booking.' });
    }
    const now = new Date();
    const decided = { decidedAt: now, decidedBy: String(req.userId), decisionReason: given.reason };

    if (action === 'reject') {
      setNoShow(booking, { status: NO_SHOW_STATUS.REJECTED, ...decided });
      await booking.save();
      await sendNotification(booking.customer, NOTIFICATION_TYPE.NO_SHOW_REJECTED, `The owner reviewed your no show report for booking ${booking.bookingId} and did not accept it: ${given.reason}. Your booking continues.`, { booking });
    } else if (action === 'confirm') {
      if (![BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
        return res.status(400).json({ message: 'This booking can no longer be cancelled.' });
      }
      // the owner cancelling: the whole verified down payment goes back, no fee, whatever the date (openRefundIfEligible reads these three)
      booking.ownerCancelled = true;
      booking.cancelReason = given.reason;
      booking.cancelledAt = now;
      booking.cancelledBy = 'admin';
      openRefundIfEligible(booking);
      booking.status = BOOKING_STATUS.CANCELLED;
      setNoShow(booking, { status: NO_SHOW_STATUS.CONFIRMED, ...decided });
      await booking.save();
      const sentence = booking.refund?.status === REFUND_STATUS.PENDING
        ? (booking.refund.paymentUnverified ? ' Your payment was not yet verified. Once it is verified, a full refund will be processed.' : ' Your whole down payment will be refunded, with no transportation fee.')
        : '';
      await sendNotification(booking.customer, NOTIFICATION_TYPE.NO_SHOW_CONFIRMED, `We are sorry: our technicians did not arrive for booking ${booking.bookingId}. We confirmed it and cancelled the booking.${sentence} You are welcome to book another date.`, { booking });
      await notifyMembersOfChange(booking, BOOKING_STATUS.APPROVED, NOTIFICATION_TYPE.BOOKING_CANCELLED, `Booking ${booking.bookingId} (${booking.date}, ${booking.time}) was cancelled after a no show was confirmed.`);
      if (booking.refund?.status === REFUND_STATUS.PENDING) {
        await notifyAdmins(NOTIFICATION_TYPE.REFUND_REQUESTED, `Booking ${booking.bookingId} was cancelled after a confirmed no show and a full refund request is waiting for review.`, { booking });
      }
    } else {
      if (![BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
        return res.status(400).json({ message: 'Only an Approved or In Progress booking can be rescheduled.' });
      }
      if (!date || !time) return sendProblem(res, invalid('Choose the new date and time.'));
      const noShowDateProblem = bookingDateProblem(date);
      if (noShowDateProblem) return sendProblem(res, invalid(noShowDateProblem));
      if (!TIME_BLOCKS.includes(time)) return res.status(400).json({ message: 'Time must be Morning or Afternoon.' });
      const closed = await businessDayProblem(Closure, date);
      if (closed) return sendProblem(res, closed);
      const conflict = await findConflictingBooking(getMemberIds(booking), date, time, booking.bookingId);
      if (conflict) return res.status(409).json({ message: `A technician on this job is already booked ${date} (${time}) on ${conflict.bookingId}. Choose a different date or time.` });
      booking.date = date;
      booking.time = time;
      // scheduled again, not in progress: the day start job starts it on its new day. Payments and everything else stay as they are.
      booking.status = BOOKING_STATUS.APPROVED;
      booking.startedBySystem = false;
      booking.startedAt = undefined;
      booking.disruption = { status: 'Rescheduled', reason: given.reason, reportedAt: now, reportedBy: String(req.userId), initiatedBy: 'admin', rescheduledAt: now };
      booking.extensionDays = [];
      setNoShow(booking, { status: NO_SHOW_STATUS.RESCHEDULED, ...decided });
      await booking.save();
      const message = `Booking ${booking.bookingId} (${booking.service?.name || 'service'}) was rescheduled at no charge to ${date}, ${time}, after the no show you reported.`;
      await sendNotification(booking.customer, NOTIFICATION_TYPE.DISRUPTION_RESCHEDULED, message, { booking });
      await notifyMembers(booking, NOTIFICATION_TYPE.DISRUPTION_RESCHEDULED, message);
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

// Admin: reject a refund request, with a reason the customer is told (for example, the payment never came through).
router.patch('/:bookingId/refund/reject', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.refund?.status !== REFUND_STATUS.PENDING) {
      return res.status(400).json({ message: 'No pending refund for this booking.' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 200) {
      return sendProblem(res, invalid('Give a short reason (3 to 200 characters) for rejecting the refund.'));
    }
    booking.refund.status = REFUND_STATUS.REJECTED;
    booking.refund.paymentUnverified = false;
    booking.refund.rejectedAt = new Date();
    booking.refund.rejectedBy = req.userId;
    booking.refund.rejectionReason = reason;
    booking.paymentCheckAfterCancel = false;
    await booking.save();

    await recordAudit({ actor: { id: req.userId, role: req.userRole }, action: 'refund.reject', entityType: 'Booking', entityId: booking.bookingId, summary: 'Rejected a refund request', meta: { reason } });
    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.REFUND_REJECTED,
      `Your refund request for booking ${booking.bookingId} was not approved: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}`,
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

router.patch('/:bookingId/refund', auth, auditSpecs.refundProcess, allowRoles(ROLE.ADMIN), uploadLimiter, upload.single('proof'), async (req, res) => {
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

    if (booking.refund.paymentUnverified) {
      return res.status(400).json({ message: 'This down payment has not been verified yet. Verify the payment first, or reject the refund if the payment did not go through.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Proof that the refund was sent is required before marking it processed.' });
    }

    const amounts = resolveRefundAmounts({
      amountPaid: booking.refund.downPaymentAmount,
      isSameDay: booking.refund.isSameDay,
      dispatchDeduction: req.body.dispatchDeduction,
      dispatchReason: req.body.dispatchReason,
      finalAmount: req.body.finalAmount,
      reason: req.body.adjustmentReason,
    });
    if (amounts.problem) return sendProblem(res, amounts.problem);

    if (booking.refund.isSameDay) {
      booking.refund.dispatchDeduction = Number(req.body.dispatchDeduction);
      booking.refund.dispatchReason = amounts.values.dispatchReason;
    }
    booking.refund.refundableAmount = amounts.values.finalAmount;
    booking.refund.computedAmount = amounts.values.computedAmount;
    booking.refund.finalAmount = amounts.values.finalAmount;
    if (amounts.values.adjusted) {
      booking.refund.adjustmentReason = amounts.values.adjustmentReason;
      booking.refund.adjustedBy = req.userId;
      booking.refund.adjustedAt = new Date();
    }

    await storeUploads(req, { kind: KINDS.REFUND_PROOF, bookingId: booking.bookingId });
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
    // A refund that has not been sent yet cannot have failed to arrive: it is still waiting for the admin.
    if (booking.refund.status !== REFUND_STATUS.PROCESSED) {
      return res.status(400).json({ message: 'This refund has not been sent yet, so there is nothing to flag. We will tell you as soon as it is processed.' });
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
    const disruptionDateProblem = bookingDateProblem(date);
    if (disruptionDateProblem) return res.status(400).json({ message: disruptionDateProblem });

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