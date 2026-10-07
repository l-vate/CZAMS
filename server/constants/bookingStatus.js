// Booking.status values, exactly as stored in the database.
const BOOKING_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
});

const BOOKING_STATUS_VALUES = Object.freeze(Object.values(BOOKING_STATUS));

module.exports = { BOOKING_STATUS, BOOKING_STATUS_VALUES };
