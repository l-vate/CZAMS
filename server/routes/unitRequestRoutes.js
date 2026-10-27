// "Not listed, ask the owner": a customer asked for a unit that is not in the catalog. The booking is Pending with a flag until the admin
// settles each request here, by picking a catalog unit, entering a unit price with a short note, or declining with a reason. The booking
// cannot be approved while a request is open or declined (PATCH admin-update). The customer is told the outcome in the app. Mounted under
// /api/bookings: PATCH /api/bookings/:bookingId/units/:index/resolve.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { allowRoles, ROLE } = require('../middleware/roles');
const Booking = require('../models/Booking');
const SuppliedUnit = require('../models/SuppliedUnit');
const mongoose = require('mongoose');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { sendNotification } = require('../utils/notifications');
const { recordAudit } = require('../utils/audit');
const { sendProblem, invalid } = require('../utils/validation');
const { sendRouteError } = require('../utils/routeErrors');
const { withWarranty } = require('../utils/bookingView');
const { ASSIGNMENT_POPULATE } = require('../utils/assignments');
const { readResolution, brandModelOf, LIMITS, REASON_MIN } = require('../utils/suppliedUnits');
const { getBookingBasePrice, getVatAmount } = require('../utils/pricing');
const { peso } = require('../utils/scopeLines');

const findItem = (id) => (mongoose.isValidObjectId(id) ? SuppliedUnit.findById(id) : null);

router.patch('/:bookingId/units/:index/resolve', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status !== BOOKING_STATUS.PENDING) {
      return sendProblem(res, invalid('A unit request can only be settled while the booking is Pending.'));
    }
    const index = Number(req.params.index);
    const unit = Number.isInteger(index) ? booking.units[index] : null;
    const supplied = unit && unit.supplied;
    if (!supplied || supplied.source !== 'requested') {
      return res.status(404).json({ message: 'That unit has no open request.' });
    }

    const resolution = await readResolution(req.body || {}, unit, findItem);
    if (resolution.problem) return sendProblem(res, resolution.problem);

    const plain = (x) => (x && typeof x.toObject === 'function' ? x.toObject() : { ...x });
    const request = supplied.request ? plain(supplied.request) : {};
    const now = new Date();
    const who = { resolvedBy: req.userId, resolvedAt: now };
    const name = `${unit.quantity} x ${unit.type}`;
    let message;
    let type;
    let action;
    let meta;

    if (resolution.kind === 'declined') {
      unit.supplied = { ...plain(supplied), status: 'Declined', declineReason: resolution.reason, ...who };
      type = NOTIFICATION_TYPE.UNIT_REQUEST_DECLINED;
      action = 'unit_request.decline';
      message = `Booking ${booking.bookingId}: we do not have the unit you asked for (${name}). ${resolution.reason} You can cancel this booking, or contact us.`;
      booking.unitDecline = { reason: resolution.reason, note: '', declinedAt: now, declinedBy: req.userId };
      meta = { unit: index, reason: resolution.reason };
    } else {
      unit.supplied = resolution.kind === 'catalog'
        ? { ...resolution.snapshot, status: 'Resolved', request, ...who }
        : {
          source: 'manual', status: 'Resolved', brand: request.brand || '', model: '', type: request.type || unit.type, hp: request.hp || unit.hp || '',
          price: resolution.price, chosenAt: now, adminNote: resolution.note, request, ...who,
        };
      unit.brandModel = brandModelOf(unit);
      // once no unit on the booking is declined any more, the customer's "cannot supply" notice goes
      if (!(booking.units || []).some((u) => u.supplied && u.supplied.status === 'Declined')) booking.unitDecline = undefined;
      if (booking.isCommercial) booking.vatAmount = getVatAmount(booking);
      type = NOTIFICATION_TYPE.UNIT_REQUEST_RESOLVED;
      action = 'unit_request.resolve';
      const chosen = [unit.supplied.brand, unit.supplied.model].filter(Boolean).join(' ') || unit.type;
      message = `Booking ${booking.bookingId}: the owner confirmed the unit you asked for (${name}): ${chosen} at ${peso(unit.supplied.price)} each. The total for your booking is now ${peso(getBookingBasePrice(booking))}.`;
      meta = { unit: index, how: resolution.kind, price: unit.supplied.price, ...(resolution.kind === 'manual' ? { note: resolution.note } : { catalogId: unit.supplied.catalogId }) };
    }

    await booking.save();
    await recordAudit({ actor: { id: req.userId, role: req.userRole }, action, entityType: 'Booking', entityId: booking.bookingId, summary: `Settled a unit request on a booking (${resolution.kind})`, meta });
    await sendNotification(booking.customer, type, message, { booking });

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

// "Cannot supply this unit": the owner tells the customer it does not have the unit. Admin only, on a Pending booking with a unit that Cooling
// Zone is to supply. A short reason is required; the note is optional and can say which units the owner does have. Nothing is cancelled:
// the customer is told in the app (and by email), and can cancel or get in touch. The booking cannot be approved until this is withdrawn.
router.patch('/:bookingId/cannot-supply', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status !== BOOKING_STATUS.PENDING) {
      return sendProblem(res, invalid('You can only say a unit cannot be supplied while the booking is Pending. Cancel the booking instead.'));
    }
    const supplies = booking.clientSuppliedUnit !== true && (booking.units || []).some((u) => u.supplied);
    if (!supplies) return sendProblem(res, invalid('This booking has no unit that Cooling Zone is to supply.'));

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (reason.length < REASON_MIN || reason.length > LIMITS.reason) return sendProblem(res, invalid(`Give a short reason of ${REASON_MIN} to ${LIMITS.reason} characters.`));
    if (note.length > LIMITS.notes) return sendProblem(res, invalid(`Keep the note to the customer to ${LIMITS.notes} characters or fewer.`));

    const now = new Date();
    const plain = (x) => (x && typeof x.toObject === 'function' ? x.toObject() : { ...x });
    // an open request on the booking is declined with it, so the owner's panel and the approval check agree
    booking.units.forEach((u) => {
      if (u.supplied && u.supplied.source === 'requested' && u.supplied.status !== 'Resolved') {
        u.supplied = { ...plain(u.supplied), status: 'Declined', declineReason: reason, resolvedBy: req.userId, resolvedAt: now };
      }
    });
    booking.unitDecline = { reason, note, declinedAt: now, declinedBy: req.userId };
    await booking.save();

    await recordAudit({
      actor: { id: req.userId, role: req.userRole }, action: 'booking.unit_decline', entityType: 'Booking', entityId: booking.bookingId,
      summary: 'Said the owner cannot supply the unit on a booking', meta: { reason, note },
    });
    await sendNotification(
      booking.customer,
      NOTIFICATION_TYPE.UNIT_REQUEST_DECLINED,
      `Booking ${booking.bookingId}: we do not have the unit you chose. Reason: ${reason}.${note ? ` ${note}` : ''} You can cancel this booking, or contact us.`,
      { booking },
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

// Admin: take the notice back (for example it was sent by mistake). The customer is not told; a declined request on the booking stays declined
// until the owner settles it.
router.delete('/:bookingId/cannot-supply', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!booking.unitDecline || !booking.unitDecline.reason) return sendProblem(res, invalid('Nothing was said about this booking.'));
    booking.unitDecline = undefined;
    await booking.save();
    await recordAudit({ actor: { id: req.userId, role: req.userRole }, action: 'booking.unit_decline_withdrawn', entityType: 'Booking', entityId: booking.bookingId, summary: 'Withdrew the cannot-supply notice on a booking' });
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
