// A customer's booking history in one summary: the latest bookings, counts, what they paid and the
// feedback they gave. Pure (the bookings and the back-job count are passed in), so it can be tested
// against an independent count. Each booking must have its service populated for the price.
const pricing = require('./pricing');

const RECENT_LIMIT = 10;
const VERIFIED_DOWN_PAYMENT = ['partially_paid', 'fully_paid', 'Paid'];

// What the customer has paid and the admin has verified, before any refund. Same rule as the
// browser's amountPaid in src/utils/salesFigures.js.
function amountPaid(booking) {
  const balanceTrack = booking.balancePaid || booking.balancePaymentStatus === 'paid';
  if (!VERIFIED_DOWN_PAYMENT.includes(booking.paymentStatus) && !balanceTrack) return 0;
  const { downPayment, balance } = pricing.getPaymentBreakdown(booking);
  const settled = balanceTrack || booking.paymentStatus === 'fully_paid' || booking.paymentStatus === 'Paid';
  return downPayment + (settled ? balance : 0);
}

function refundedAmount(booking) {
  if (booking.refund?.status !== 'Processed') return 0;
  return booking.refund.finalAmount ?? booking.refund.refundableAmount ?? 0;
}

function summarizeHistory(bookings, backJobClaims) {
  const count = (status) => bookings.filter((b) => b.status === status).length;
  // Newest service date first, then newest request.
  const sorted = [...bookings].sort((a, b) => String(b.date).localeCompare(String(a.date)) || new Date(b.createdAt) - new Date(a.createdAt));

  return {
    recent: sorted.slice(0, RECENT_LIMIT).map((b) => ({
      bookingId: b.bookingId,
      service: b.service?.name || '-',
      date: b.date,
      status: b.status,
      total: pricing.getBookingBasePrice(b),
    })),
    counts: {
      total: bookings.length,
      completed: count('Completed'),
      cancelled: count('Cancelled'),
      pending: count('Pending'),
      approved: count('Approved'),
      inProgress: count('In Progress'),
      backJobs: backJobClaims,
    },
    totalPaid: bookings.reduce((sum, b) => sum + amountPaid(b), 0),
    totalRefunded: bookings.reduce((sum, b) => sum + refundedAmount(b), 0),
    feedback: sorted
      .filter((b) => typeof b.feedback?.rating === 'number' || b.feedback?.text)
      .map((b) => ({
        bookingId: b.bookingId,
        service: b.service?.name || '-',
        rating: b.feedback.rating ?? null,
        text: b.feedback.text || '',
        createdAt: b.feedback.createdAt || null,
      })),
  };
}

module.exports = { RECENT_LIMIT, amountPaid, refundedAmount, summarizeHistory };
