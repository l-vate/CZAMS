// A customer cannot delete their account while something of theirs is still open: an active booking, a refund
// that is not settled, or a back job claim waiting for the admin. Once those are done the account can go; the
// completed history stays, because it belongs to the company's records.
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { REFUND_STATUS } = require('../constants/refundStatus');
const { BACK_JOB_STATUS } = require('../constants/backJobStatus');

const ACTIVE = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// null when nothing blocks the deletion, otherwise the sentence to show the customer.
function describeBlockers({ activeBookings = 0, openRefunds = 0, openBackJobs = 0 }) {
  const parts = [];
  if (activeBookings > 0) parts.push(`${plural(activeBookings, 'booking that is', 'bookings that are')} still Pending, Approved or In Progress`);
  if (openRefunds > 0) parts.push(`${plural(openRefunds, 'refund that is', 'refunds that are')} not settled yet`);
  if (openBackJobs > 0) parts.push(`${plural(openBackJobs, 'back job claim that is', 'back job claims that are')} waiting for review`);
  if (parts.length === 0) return null;
  return `Your account cannot be deleted yet. You have ${parts.join(', ')}. Cancel or finish them first, then try again.`;
}

// Counts what is open for this customer. `Booking` and `BackJob` are the Mongoose models.
async function findDeletionBlockers(userId, { Booking, BackJob }) {
  const [activeBookings, pendingRefunds, flaggedRefunds, openBackJobs] = await Promise.all([
    Booking.countDocuments({ customer: userId, status: { $in: ACTIVE } }),
    Booking.countDocuments({ customer: userId, 'refund.status': REFUND_STATUS.PENDING }),
    Booking.countDocuments({ customer: userId, 'refund.customerFlag.flagged': true, 'refund.customerFlag.resolved': { $ne: true } }),
    // A Scheduled claim is a free repair visit that is itself an active booking (counted above); only a claim the
    // admin has not reviewed yet is open on its own.
    BackJob.countDocuments({ customer: userId, status: BACK_JOB_STATUS.NOT_COVERED }),
  ]);
  const counts = { activeBookings, openRefunds: pendingRefunds + flaggedRefunds, openBackJobs };
  return { counts, message: describeBlockers(counts) };
}

module.exports = { describeBlockers, findDeletionBlockers };
