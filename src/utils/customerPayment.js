// How a customer is told where their payments stand. Pure and free of app imports so it is tested on its own.
//
// A label never says "paid" until an admin has verified a payment: a proof that was just sent is "Waiting for verification", and a verified
// down payment is "Down payment verified" (not "Partially Paid", which sounded like part of the total was already settled).
import { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } from '../constants/paymentStatus.js';
import { isBookingFullyPaid } from './receiptStatus.js';

export const PAYMENT_LABEL = Object.freeze({
  UNPAID: 'Unpaid',
  WAITING: 'Waiting for verification',
  DOWN_VERIFIED: 'Down payment verified',
  FULLY_PAID: 'Fully paid',
  REJECTED: 'Payment rejected',
});

// { key, label } for a booking's payment, from the stored statuses only. A cancelled booking is handled by the caller.
export function customerPaymentStatus(booking) {
  if (isBookingFullyPaid(booking)) return { key: 'fully_paid', label: PAYMENT_LABEL.FULLY_PAID };
  const balance = booking.balancePaymentStatus;
  const down = booking.paymentStatus;
  if (down === PAYMENT_STATUS.TO_VERIFY || balance === BALANCE_PAYMENT_STATUS.TO_VERIFY) return { key: 'to_verify', label: PAYMENT_LABEL.WAITING };
  if (balance === BALANCE_PAYMENT_STATUS.REJECTED) return { key: 'rejected', label: PAYMENT_LABEL.REJECTED };
  if (down === PAYMENT_STATUS.REJECTED || down === 'Rejected') return { key: 'rejected', label: PAYMENT_LABEL.REJECTED };
  if (down === PAYMENT_STATUS.PARTIALLY_PAID) return { key: 'down_verified', label: PAYMENT_LABEL.DOWN_VERIFIED };
  return { key: 'unpaid', label: PAYMENT_LABEL.UNPAID };
}

// Why the last proof was rejected, when the booking carries it (the server sends it for a rejected payment only).
export function rejectionReasonOf(booking) {
  if (booking.balancePaymentStatus === BALANCE_PAYMENT_STATUS.REJECTED) return booking.balanceRejectionReason || '';
  if (booking.paymentStatus === PAYMENT_STATUS.REJECTED) return booking.downPaymentRejectionReason || '';
  return '';
}

export const BILL_FILTERS = Object.freeze(['All', 'Due', 'To Verify', 'Down payment verified', 'Fully Paid', 'Unpaid', 'Refunded']);

// Whether a bill belongs under a filter pill. `bill` carries the flags Billing works out (isCancelled, isRefunded, isBackJob, due, ...).
export function billMatchesFilter(bill, filter) {
  if (filter === 'All') return true;
  if (filter === 'Refunded') return Boolean(bill.isRefunded);
  if (bill.isCancelled) return false; // cancelled bookings (refunded excepted above) only show under "All": their old payment status no longer applies
  if (bill.isBackJob) return false; // a free back job has nothing to bill
  if (filter === 'Due') return Boolean(bill.due && bill.due.kind);
  if (filter === 'To Verify') return Boolean(bill.isToVerify || bill.isBalanceToVerify);
  if (filter === 'Fully Paid') return Boolean(bill.isFullyPaid);
  if (filter === 'Down payment verified') return Boolean(bill.isPartiallyPaid && !bill.isFullyPaid);
  if (filter === 'Unpaid') return bill.paymentStatus === PAYMENT_STATUS.UNPAID || Boolean(bill.isRejected);
  return true;
}
