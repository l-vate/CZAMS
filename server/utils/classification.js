const { BOOKING_STATUS } = require('../constants/bookingStatus');
const Booking = require('../models/Booking');

// Customer Classification Module thresholds. Client-confirmed: commercial clients
// clean quarterly (4x/year), residential clean 3x/year - a flat 3 catches both
// segments, since commercial's 4x/year always clears it too, so no need to split
// the logic by client type. Kept as a named constant so a future change is still
// a one-line edit instead of a re-find-the-logic exercise.
const RETURN_CUSTOMER_MIN_BOOKINGS = 3;
const RETURN_CUSTOMER_WINDOW_MONTHS = 12;

// RETURN_CUSTOMER_MIN_BOOKINGS+ completed bookings within a rolling window
// auto-flags a customer as "Return" - re-evaluated fresh on every read rather
// than cached, so it naturally drops back to "Regular" if a Return customer goes
// quiet for a year with no new completion.
async function computeAutoClassification(customerId) {
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - RETURN_CUSTOMER_WINDOW_MONTHS);

  const completedCount = await Booking.countDocuments({
    customer: customerId,
    status: BOOKING_STATUS.COMPLETED,
    completedAt: { $gte: windowStart },
    // A free back-job repair visit isn't a new service the customer chose to book -
    // it's a redo of one already counted, so it shouldn't inflate the return-customer count.
    isBackJob: { $ne: true },
  });

  return completedCount >= RETURN_CUSTOMER_MIN_BOOKINGS ? 'Return' : 'Regular';
}

// A manual admin override always wins over the auto-computed value.
async function resolveClassification(user) {
  return user.manualClassification || computeAutoClassification(user._id);
}

module.exports = {
  RETURN_CUSTOMER_MIN_BOOKINGS,
  RETURN_CUSTOMER_WINDOW_MONTHS,
  computeAutoClassification,
  resolveClassification,
};
