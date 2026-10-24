// The quotation details of a booking (admin only): estimated duration, exclusions, warranty terms, whether the quoted prices include VAT,
// and the site details. Mounted under /api/bookings: PATCH /api/bookings/:bookingId/quotation. The rules are in utils/quotation.js. Every
// change is written to the audit trail with the values before and after, and a change the customer should know about is told to them.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { allowRoles, ROLE } = require('../middleware/roles');
const Booking = require('../models/Booking');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { sendNotification } = require('../utils/notifications');
const { recordAudit } = require('../utils/audit');
const { sendProblem, invalid } = require('../utils/validation');
const { sendRouteError } = require('../utils/routeErrors');
const { withWarranty } = require('../utils/bookingView');
const { ASSIGNMENT_POPULATE } = require('../utils/assignments');
const { readQuotationInput, describeChange } = require('../utils/quotation');
const { getVatAmount } = require('../utils/pricing');

const OPEN = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];
const TERM_FIELDS = ['estimatedDays', 'exclusions', 'warrantyMonths', 'unitWarrantyText', 'taxInclusive'];

const plain = (x) => (x && typeof x.toObject === 'function' ? x.toObject() : { ...(x || {}) });

router.patch('/:bookingId/quotation', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!OPEN.includes(booking.status)) {
      return sendProblem(res, invalid('The quotation details can only be changed while a booking is Pending, Approved or In Progress.'));
    }

    const input = readQuotationInput(req.body || {});
    if (input.problem) return sendProblem(res, input.problem);
    const { changes } = input;

    const isInstallation = booking.service?.serviceType === SERVICE_TYPE.INSTALLATION;
    if (!isInstallation && TERM_FIELDS.some((f) => f in changes)) {
      return sendProblem(res, invalid('The duration, exclusions, warranty terms and VAT setting are for an Installation booking.'));
    }

    const { before, after } = describeChange(booking, changes);

    // the quotation object: what was sent replaces what was there, and null puts a field back to its default
    const next = plain(booking.quotation);
    ['estimatedDays', 'exclusions', 'warrantyMonths', 'unitWarrantyText'].forEach((field) => {
      if (!(field in changes)) return;
      if (changes[field] === null) delete next[field];
      else next[field] = changes[field];
    });
    if (Object.keys(changes).some((f) => ['estimatedDays', 'exclusions', 'warrantyMonths', 'unitWarrantyText'].includes(f))) booking.quotation = next;
    if ('site' in changes) booking.site = changes.site;
    if ('taxInclusive' in changes) {
      booking.taxInclusive = changes.taxInclusive;
      // a commercial booking's VAT is the part inside the price when the prices include it, and 12% on top when they do not
      if (booking.isCommercial) booking.vatAmount = getVatAmount(booking);
    }
    await booking.save();

    await recordAudit({
      actor: { id: req.userId, role: req.userRole },
      action: 'quotation.update',
      entityType: 'Booking',
      entityId: booking.bookingId,
      summary: `Changed the quotation details: ${Object.keys(changes).join(', ')}`,
      meta: { before, after },
    });

    // the customer is told about a change to the terms they agreed to (the site details are for the crew, not a term)
    const told = Object.keys(changes).filter((f) => TERM_FIELDS.includes(f));
    if (told.length > 0) {
      const labels = { estimatedDays: 'the estimated duration', exclusions: 'what is not included', warrantyMonths: 'the warranty', unitWarrantyText: 'the warranty', taxInclusive: 'whether the prices include VAT' };
      const what = [...new Set(told.map((f) => labels[f]))].join(', ');
      await sendNotification(booking.customer, NOTIFICATION_TYPE.QUOTATION_UPDATED, `Booking ${booking.bookingId}: ${what} on your quotation was updated. Open your booking to read the details.`, { booking });
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

module.exports = router;
