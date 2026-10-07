// Booking.paymentStatus (the down payment track) values, exactly as stored.
export const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'Unpaid',
  TO_VERIFY: 'to_verify',
  PARTIALLY_PAID: 'partially_paid',
  FULLY_PAID: 'fully_paid',
  REJECTED: 'rejected',
});

export const PAYMENT_STATUS_VALUES = Object.freeze(Object.values(PAYMENT_STATUS));

// Booking.balancePaymentStatus (the remaining balance track) values, exactly as stored.
export const BALANCE_PAYMENT_STATUS = Object.freeze({
  NONE: 'None',
  TO_VERIFY: 'to_verify',
  PAID: 'paid',
  REJECTED: 'rejected',
});

export const BALANCE_PAYMENT_STATUS_VALUES = Object.freeze(Object.values(BALANCE_PAYMENT_STATUS));
