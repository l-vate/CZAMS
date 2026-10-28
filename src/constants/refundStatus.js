// Booking.refund.status values, exactly as stored.
export const REFUND_STATUS = Object.freeze({
  NONE: 'None',
  PENDING: 'Pending',
  PROCESSED: 'Processed',
  REJECTED: 'Rejected', // the owner did not approve the refund (for example, the payment never came through)
});

export const REFUND_STATUS_VALUES = Object.freeze(Object.values(REFUND_STATUS));
