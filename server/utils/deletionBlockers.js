// A customer cannot delete their account while something of theirs is still open: an active booking (Pending, Approved or In
// Progress), a refund that is not settled, a cancelled booking whose payment proof is still being checked (a refund opens once it is
// verified), or a back job claim waiting for the admin. Once those are done the account can go; the completed history stays, because it
// belongs to the company's records.
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { REFUND_STATUS } = require('../constants/refundStatus');
const { BACK_JOB_STATUS } = require('../constants/backJobStatus');

const ACTIVE = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];

// null when nothing blocks the deletion, otherwise the sentence to show the customer. With an active booking the first sentence is the
// fixed one the page shows; anything else that is open (money or a claim) is named after it.
function describeBlockers({ activeBookings = 0, openRefunds = 0, openBackJobs = 0, cancelledAwaitingCheck = 0 }) {
  const others = [];
  if (openRefunds > 0) others.push(`${openRefunds} ${openRefunds === 1 ? 'refund needs' : 'refunds need'} to be settled`);
  if (cancelledAwaitingCheck > 0) {
    others.push(`${cancelledAwaitingCheck} ${cancelledAwaitingCheck === 1 ? 'cancelled booking needs' : 'cancelled bookings need'} to be settled (${cancelledAwaitingCheck === 1 ? 'its payment proof is' : 'their payment proofs are'} still being checked)`);
  }
  if (openBackJobs > 0) others.push(`${openBackJobs} ${openBackJobs === 1 ? 'back job claim needs' : 'back job claims need'} to be reviewed`);
  if (activeBookings === 0 && others.length === 0) return null;
  if (activeBookings > 0) {
    return `You cannot delete your account while you have active bookings. Complete or cancel them first.${others.length > 0 ? ` Also open: ${others.join('; ')}.` : ''}`;
  }
  return `You cannot delete your account yet. ${others.join('; ')}. Try again once that is done.`;
}

// Counts what is open for this customer. `Booking` and `BackJob` are the Mongoose models.
async function findDeletionBlockers(userId, { Booking, BackJob }) {
  const [activeBookings, pendingRefunds, flaggedRefunds, cancelledAwaitingCheck, openBackJobs] = await Promise.all([
    Booking.countDocuments({ customer: userId, status: { $in: ACTIVE } }),
    Booking.countDocuments({ customer: userId, 'refund.status': REFUND_STATUS.PENDING }),
    Booking.countDocuments({ customer: userId, 'refund.customerFlag.flagged': true, 'refund.customerFlag.resolved': { $ne: true } }),
    // A booking cancelled while its down payment proof was still being checked: the admin verifies or rejects the proof, and a refund
    // opens once it is verified, so the money is still open.
    Booking.countDocuments({ customer: userId, status: BOOKING_STATUS.CANCELLED, paymentCheckAfterCancel: true }),
    // A Scheduled claim is a free repair visit that is itself an active booking (counted above); only a claim the
    // admin has not reviewed yet is open on its own.
    BackJob.countDocuments({ customer: userId, status: BACK_JOB_STATUS.NOT_COVERED }),
  ]);
  const counts = { activeBookings, openRefunds: pendingRefunds + flaggedRefunds, cancelledAwaitingCheck, openBackJobs };
  return { counts, message: describeBlockers(counts) };
}

module.exports = { describeBlockers, findDeletionBlockers };
