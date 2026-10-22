// Scope of works lines on a booking (admin only): add, edit and remove. Mounted under /api/bookings, so the paths are
// /api/bookings/:bookingId/scope-lines. Every change is checked by utils/scopeLines.js, recorded in the audit log with the line before and
// after, and told to the customer with the new total. The down payment is never touched: only the remaining balance moves.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { allowRoles, ROLE } = require('../middleware/roles');
const Booking = require('../models/Booking');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { sendNotification } = require('../utils/notifications');
const { recordAudit } = require('../utils/audit');
const { sendProblem } = require('../utils/validation');
const { sendRouteError } = require('../utils/routeErrors');
const { withWarranty } = require('../utils/bookingView');
const { ASSIGNMENT_POPULATE } = require('../utils/assignments');
const {
  readLineInput, readReason, withLines, totalOwed, scopeChangeProblem, lineView, changeMessage, scopeLinesOf, getVatAmount,
} = require('../utils/scopeLines');

const toPlain = (line) => (line && typeof line.toObject === 'function' ? line.toObject() : { ...line });

async function loadBooking(req, res) {
  const booking = await Booking.findOne({ bookingId: req.params.bookingId }).populate('service');
  if (!booking) { res.status(404).json({ message: 'Booking not found' }); return null; }
  return booking;
}

// Saves `lines` as the booking's scope of works. The distance based charge field follows the distance lines (one charge, never two),
// and a commercial booking's VAT follows the new price. Returns the sentence-ready totals.
async function applyLines(booking, lines) {
  const distance = lines.filter((l) => l.kind === 'distance');
  booking.scopeLines = lines;
  booking.distanceAdjustment = distance.length > 0 ? distance.reduce((sum, l) => sum + l.amount, 0) : 0;
  if (booking.isCommercial) booking.vatAmount = getVatAmount(booking);
  await booking.save();
  return totalOwed(booking);
}

async function respond(res, booking) {
  const populated = await booking.populate([
    { path: 'service' },
    { path: 'customer', select: 'name email phone clientType companyName representativeName' },
    { path: 'technician', select: 'name' },
    ...ASSIGNMENT_POPULATE,
  ]);
  res.json(withWarranty(populated));
}

async function audit(req, booking, action, summary, meta) {
  await recordAudit({ actor: { id: req.userId, role: req.userRole }, action, entityType: 'Booking', entityId: booking.bookingId, summary, meta });
}

router.post('/:bookingId/scope-lines', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;
    const input = readLineInput(req.body || {});
    if (input.problem) return sendProblem(res, input.problem);

    const current = scopeLinesOf(booking).map(toPlain);
    const line = { ...input.values, addedBy: req.userId, addedAt: new Date() };
    const next = [...current, line];
    const problem = scopeChangeProblem(booking, withLines(booking, next));
    if (problem) return sendProblem(res, problem);

    const replacedDistance = line.kind === 'distance' && !current.some((l) => l.kind === 'distance') ? (booking.distanceAdjustment || 0) : 0;
    const totalBefore = totalOwed(booking);
    const total = await applyLines(booking, next);
    await audit(req, booking, 'scope_line.add', `Added a scope of works line: ${line.description}`, {
      after: lineView(line), totalBefore, totalAfter: total, ...(replacedDistance ? { replacedDistanceAdjustment: replacedDistance } : {}),
    });
    await sendNotification(booking.customer, NOTIFICATION_TYPE.SCOPE_UPDATED, changeMessage(booking.bookingId, 'added', line, null, total), { booking });
    await respond(res, booking);
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.patch('/:bookingId/scope-lines/:lineId', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;
    const current = (booking.scopeLines || []).map(toPlain);
    const index = current.findIndex((l) => String(l._id) === req.params.lineId);
    if (index === -1) return res.status(404).json({ message: 'That line does not exist.' });

    const reason = readReason(req.body && req.body.reason);
    if (reason.problem) return sendProblem(res, reason.problem);
    const input = readLineInput(req.body || {}, current[index]);
    if (input.problem) return sendProblem(res, input.problem);

    const before = current[index];
    const updated = { ...before, ...input.values };
    const next = current.map((l, i) => (i === index ? updated : l));
    const problem = scopeChangeProblem(booking, withLines(booking, next));
    if (problem) return sendProblem(res, problem);

    const totalBefore = totalOwed(booking);
    const total = await applyLines(booking, next);
    await audit(req, booking, 'scope_line.edit', `Changed a scope of works line: ${updated.description}`, {
      before: lineView(before), after: lineView(updated), reason: reason.reason, totalBefore, totalAfter: total,
    });
    await sendNotification(booking.customer, NOTIFICATION_TYPE.SCOPE_UPDATED, changeMessage(booking.bookingId, 'changed', updated, before, total), { booking });
    await respond(res, booking);
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.delete('/:bookingId/scope-lines/:lineId', auth, allowRoles(ROLE.ADMIN), async (req, res) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;
    const current = (booking.scopeLines || []).map(toPlain);
    const index = current.findIndex((l) => String(l._id) === req.params.lineId);
    if (index === -1) return res.status(404).json({ message: 'That line does not exist.' });

    const reason = readReason(req.body && req.body.reason);
    if (reason.problem) return sendProblem(res, reason.problem);

    const removed = current[index];
    const next = current.filter((_, i) => i !== index);
    const problem = scopeChangeProblem(booking, withLines(booking, next));
    if (problem) return sendProblem(res, problem);

    const totalBefore = totalOwed(booking);
    const total = await applyLines(booking, next);
    await audit(req, booking, 'scope_line.remove', `Removed a scope of works line: ${removed.description}`, {
      before: lineView(removed), reason: reason.reason, totalBefore, totalAfter: total,
    });
    await sendNotification(booking.customer, NOTIFICATION_TYPE.SCOPE_UPDATED, changeMessage(booking.bookingId, 'removed', removed, null, total), { booking });
    await respond(res, booking);
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;
