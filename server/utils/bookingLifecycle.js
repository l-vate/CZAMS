// What happens to a booking by itself on its service day: a Pending booking nobody approved in time is cancelled (with a refund request for
// what the customer paid), and an Approved booking starts. Every rule here takes `now` as a parameter, so it can be tested with a fixed clock.
// Everything is a conditional update (the booking must still be in the status the rule saw), so an admin acting at the same moment is never
// overwritten and a second run does nothing. Nothing here is ever paid out: a refund request is only opened, the payout stays an admin action.
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { PAYMENT_STATUS } = require('../constants/paymentStatus');
const { REFUND_STATUS } = require('../constants/refundStatus');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { PENDING_EXPIRY_GRACE_DAYS, EXPIRY_BATCH_SIZE, EXPIRY_REASON } = require('../constants/bookingLifecycle');
const { manilaToday, manilaDateKey, addDaysManila } = require('./manilaDate');
const { getBookingUnitsSubtotal } = require('./pricing');
const { getMemberIds } = require('./assignments');
const { sendNotification, notifyAdmins } = require('./notifications');
const { recordAudit } = require('./audit');

const SYSTEM_ACTOR = Object.freeze({ role: 'system', name: 'system' });
const APPROVAL_TOO_LATE = 'This booking can no longer be approved because its service day has started.';
const ADMIN_SUMMARY_LIMIT = 5; // more expired bookings than this in one run are announced to the admins in one summary

// A booking made on or after the start of its own booked day (an urgent entry by the admin) is not expired during that day.
function createdOnOrAfterItsDay(booking) {
  return Boolean(booking.createdAt) && Boolean(booking.date) && manilaDateKey(booking.createdAt) >= booking.date;
}

// True when a Pending booking is past the point where it can still be approved: its booked date (plus the grace days) is today or earlier.
function isPastApproval(booking, now = new Date(), graceDays = PENDING_EXPIRY_GRACE_DAYS) {
  if (!booking || booking.status !== BOOKING_STATUS.PENDING || !booking.date) return false;
  const lastDay = addDaysManila(booking.date, graceDays);
  const today = manilaToday(now);
  return createdOnOrAfterItsDay(booking) ? lastDay < today : lastDay <= today;
}

// The message for an approval that comes too late, or null.
function approvalProblem(booking, now = new Date(), graceDays = PENDING_EXPIRY_GRACE_DAYS) {
  return isPastApproval(booking, now, graceDays) ? APPROVAL_TOO_LATE : null;
}

// The down payment in pesos: what the customer paid when they submitted it, else the current figure (needs `service` populated).
function downPaymentOf(booking) {
  return typeof booking.downPaymentPaidAmount === 'number'
    ? booking.downPaymentPaidAmount
    : Math.round(getBookingUnitsSubtotal(booking) * ((booking.downPaymentPercent || 0) / 100));
}

// The refund request an expired booking gets, or null when no payment was submitted. Full amount, no fee, like an owner cancellation.
function expiryRefundFor(booking, now) {
  const dp = booking.downPaymentPercent > 0;
  const verified = dp && [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus);
  const unverified = dp && booking.paymentStatus === PAYMENT_STATUS.TO_VERIFY;
  if (!verified && !unverified) return null;
  const amount = downPaymentOf(booking);
  return {
    status: REFUND_STATUS.PENDING,
    isSameDay: false,
    ownerInitiated: true,
    systemInitiated: true,
    expired: true,
    reason: EXPIRY_REASON,
    downPaymentAmount: amount,
    dispatchDeduction: 0,
    refundableAmount: amount,
    ...(unverified ? { paymentUnverified: true } : {}),
    requestedAt: now,
  };
}

// The customer's explanation. `refund` is the refund request opened (or null).
function expiryMessage(booking, refund) {
  const sentence = !refund
    ? 'No payment was made, so there is nothing to refund.'
    : refund.paymentUnverified
      ? 'Your payment was not yet verified. Once it is verified, a full refund will be processed.'
      : 'A full refund of your down payment is being processed.';
  return `Your booking ${booking.bookingId} for ${booking.date} was cancelled automatically because it was not confirmed by the owner before the service day started. ${sentence} You are welcome to book another date.`;
}

// Cancels one Pending booking for good and opens its refund request, in ONE conditional write of the booking document (the refund lives in the
// same document), so a booking is never left Cancelled without its refund request. Returns { booking, refund } or null when the booking was no
// longer Pending (an admin got there first) or was moved to another date meanwhile.
async function expireOne(booking, now) {
  const refund = expiryRefundFor(booking, now);
  const set = {
    status: BOOKING_STATUS.CANCELLED,
    cancelledAt: now,
    cancelledBy: 'system',
    expiredBySystem: true,
    cancelReason: EXPIRY_REASON,
    ...(refund ? { refund } : {}),
    ...(refund && refund.paymentUnverified ? { paymentCheckAfterCancel: true } : {}),
  };
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: BOOKING_STATUS.PENDING, date: booking.date },
    { $set: set },
    { returnDocument: 'after' }
  );
  return updated ? { booking: updated, refund } : null;
}

async function tellAboutExpiry(done) {
  for (const { booking, refund } of done) {
    try {
      await sendNotification(booking.customer, NOTIFICATION_TYPE.BOOKING_EXPIRED, expiryMessage(booking, refund), { booking });
    } catch (err) {
      console.error('Could not tell a customer that a booking expired:', err.message);
    }
  }
  const refunds = done.filter((d) => d.refund).length;
  if (done.length === 0) return;
  if (done.length <= ADMIN_SUMMARY_LIMIT) {
    for (const { booking, refund } of done) {
      await notifyAdmins(
        NOTIFICATION_TYPE.BOOKING_EXPIRED,
        `Booking ${booking.bookingId} expired: it was not approved before its service day (${booking.date}) and was cancelled automatically.${refund ? ` A full refund request${refund.paymentUnverified ? ' (payment not verified yet)' : ''} is waiting for you in Refunds.` : ' No payment was made, so there is no refund.'}`,
        { booking }
      );
    }
  } else {
    await notifyAdmins(NOTIFICATION_TYPE.BOOKING_EXPIRED, `${done.length} bookings expired because they were not approved before their service day. ${refunds} refund ${refunds === 1 ? 'request is' : 'requests are'} waiting for you in Refunds.`);
  }
}

// Expires every Pending booking that is past approval. `dryRun` only counts. Processes in batches and returns counts only.
async function expirePendingBookings({ now = new Date(), dryRun = false, graceDays = PENDING_EXPIRY_GRACE_DAYS, batchSize = EXPIRY_BATCH_SIZE } = {}) {
  const lastDay = addDaysManila(manilaToday(now), -graceDays);
  const result = { matched: 0, expired: 0, refundRequests: 0, skipped: 0 };
  const done = [];
  let after = null;
  for (;;) {
    const filter = { status: BOOKING_STATUS.PENDING, date: { $lte: lastDay }, ...(after ? { _id: { $gt: after } } : {}) };
    const batch = await Booking.find(filter).sort({ _id: 1 }).limit(batchSize).populate('service');
    if (batch.length === 0) break;
    after = batch[batch.length - 1]._id;
    for (const booking of batch) {
      if (!isPastApproval(booking, now, graceDays)) { result.skipped += 1; continue; }
      result.matched += 1;
      if (dryRun) continue;
      const moved = await expireOne(booking, now);
      if (!moved) { result.skipped += 1; continue; }
      result.expired += 1;
      if (moved.refund) result.refundRequests += 1;
      done.push(moved);
      await recordAudit({
        actor: SYSTEM_ACTOR,
        action: 'booking.expire',
        entityType: 'Booking',
        entityId: booking.bookingId,
        summary: 'Cancelled automatically: not confirmed before the booked date',
        meta: { reason: EXPIRY_REASON, refundOpened: Boolean(moved.refund), paymentNotVerified: Boolean(moved.refund && moved.refund.paymentUnverified) },
      });
      if (moved.refund) {
        await recordAudit({
          actor: SYSTEM_ACTOR,
          action: 'refund.open',
          entityType: 'Booking',
          entityId: booking.bookingId,
          summary: 'Opened a full refund request for an expired booking (no fee)',
          meta: { expired: true, fee: 0, paymentNotVerified: Boolean(moved.refund.paymentUnverified) },
        });
      }
    }
    if (batch.length < batchSize) break;
  }
  if (!dryRun) await tellAboutExpiry(done);
  return result;
}

// Moves every Approved booking whose booked day is today (or earlier, when a run was missed) to In Progress. The customer gets no email: the
// technicians on the job get an in-app note only.
async function startApprovedBookings({ now = new Date(), dryRun = false } = {}) {
  const today = manilaToday(now);
  const due = await Booking.find({ status: BOOKING_STATUS.APPROVED, date: { $lte: today } });
  const result = { matched: due.length, started: 0 };
  if (dryRun) return result;
  for (const booking of due) {
    const moved = await Booking.findOneAndUpdate(
      { _id: booking._id, status: BOOKING_STATUS.APPROVED, date: booking.date },
      { $set: { status: BOOKING_STATUS.IN_PROGRESS, startedBySystem: true, startedAt: now } },
      { returnDocument: 'after' }
    );
    if (!moved) continue;
    result.started += 1;
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: 'booking.start',
      entityType: 'Booking',
      entityId: booking.bookingId,
      summary: 'Service day started',
    });
    try {
      // an in-app note only (Notification.create, not sendNotification, so nothing is queued for email)
      await Promise.all(getMemberIds(moved).map((id) => Notification.create({
        user: id,
        type: NOTIFICATION_TYPE.BOOKING_IN_PROGRESS,
        message: `Booking ${moved.bookingId} (${moved.date}, ${moved.time}) is today. It is now in progress.`,
        relatedBooking: moved._id,
        relatedBookingId: moved.bookingId,
      })));
    } catch (err) {
      console.error('Could not note the start of a service day for the technicians:', err.message);
    }
  }
  return result;
}

// The whole day start job: expire first, then start. Returns counts only.
async function runDayStart({ now = new Date(), dryRun = false } = {}) {
  const expiry = await expirePendingBookings({ now, dryRun });
  const start = await startApprovedBookings({ now, dryRun });
  return { dryRun, expiry, start };
}

module.exports = { isPastApproval, approvalProblem, expirePendingBookings, startApprovedBookings, runDayStart, expiryRefundFor, expiryMessage, APPROVAL_TOO_LATE, SYSTEM_ACTOR };
