// A Pending booking is not visible to technicians. The system may already have proposed a lead and a helper
// for it (auto-assign runs when the booking is made), and the admin can see and change that, but the
// technicians hear about the job and can see it only once the admin approves it.
//
// Every technician-reachable booking route and report route uses this one rule, so a Pending booking is
// hidden everywhere at once: My Jobs, the calendar, the dashboard counts, job details, the reports list,
// the assignment history, and the disruption, extension and report actions.
const { BOOKING_STATUS } = require('../constants/bookingStatus');

// Added to a Mongo filter that finds a technician's bookings.
const TECHNICIAN_BOOKING_FILTER = Object.freeze({ status: { $ne: BOOKING_STATUS.PENDING } });

// true when a technician must not see this booking yet.
const isHiddenFromTechnicians = (booking) => booking?.status === BOOKING_STATUS.PENDING;

module.exports = { TECHNICIAN_BOOKING_FILTER, isHiddenFromTechnicians };
