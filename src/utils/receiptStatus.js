// What kind of document a booking gets and whether it is settled. Kept free of other app imports
// so the rule can be tested on its own.
import { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } from '../constants/paymentStatus.js';

// True once the booking is fully paid: the status says so directly, or the down payment was
// accepted and the balance has separately been settled (records saved before the status was also
// bumped to fully_paid on balance approval).
export function isBookingFullyPaid(booking) {
  const isPartiallyPaid = booking.paymentStatus === PAYMENT_STATUS.PARTIALLY_PAID;
  const isBalancePaid = booking.balancePaymentStatus === BALANCE_PAYMENT_STATUS.PAID || Boolean(booking.balancePaid);
  return booking.paymentStatus === PAYMENT_STATUS.FULLY_PAID
    || booking.paymentStatus === 'Paid'
    || (isPartiallyPaid && isBalancePaid);
}

// "Invoice" while there is still something to pay, "Acknowledgment Receipt" once fully paid.
export function documentTitle(isFullyPaid) {
  return isFullyPaid ? 'Acknowledgment Receipt' : 'Invoice';
}
