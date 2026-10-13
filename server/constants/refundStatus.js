// Booking.refund.status values, exactly as stored.
const REFUND_STATUS = Object.freeze({
  NONE: 'None',
  PENDING: 'Pending',
  PROCESSED: 'Processed',
});

const REFUND_STATUS_VALUES = Object.freeze(Object.values(REFUND_STATUS));

module.exports = { REFUND_STATUS, REFUND_STATUS_VALUES };
