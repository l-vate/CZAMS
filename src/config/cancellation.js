// What a customer is told about cancelling on or after the booked date, in one place, so the question before cancelling and the answer after
// it use the same words. The amount of the fee is set by an admin for each refund; only the rule is written here.
// Plain functions and strings, no framework, so the tests load this file on its own.

// The rule itself: before the booked date the whole down payment is refunded; on or after the booked date a transportation fee, decided by
// the owner, may be deducted from it first.
export const SAME_DAY_DEDUCTION_CLAUSE = 'a transportation fee may be deducted from your down payment before it is refunded';

// Shown in the "Cancel this booking?" dialog, before the customer confirms, when the booked date is today or already past.
export const SAME_DAY_CANCEL_WARNING = `You are cancelling on or after the booked date, so ${SAME_DAY_DEDUCTION_CLAUSE}. If you cancel before the booked date, your down payment is refunded in full.`;

// Shown in the same dialog when the booked date is still ahead: the rule for both cases, so the customer knows it before confirming.
export const CANCEL_POLICY_NOTE = 'You can cancel before the service starts. If you cancel before the booked date, your down payment is refunded in full. Cancelling on or after the booked date may result in a transportation fee deducted from the down payment.';

// Shown after cancelling, with the down payment amount on file (text such as "₱300").
export const sameDayCancelledMessage = (amountText) => `Since this was cancelled on or after the booked date, a transportation fee may be deducted from your down payment of ${amountText} before it is refunded.`;

// Whether the warning applies: the booked date is today or already past (Manila day keys) and a down payment is on file or waiting to be checked.
export function showsSameDayWarning(booking, todayKey) {
  if (!booking || !todayKey) return false;
  return booking.date <= todayKey && ['to_verify', 'partially_paid', 'fully_paid'].includes(booking.paymentStatus);
}

// What the "Cancel this booking?" dialog says: only the rule that applies to this booking, never both. (CANCEL_POLICY_NOTE above states both and
// stays for the landing page, which speaks to everyone.)
export const FULL_REFUND_NOTE = 'The booked date has not come yet, so your verified down payment is refunded in full.';
export const TRANSPORT_FEE_NOTE = 'You are cancelling on or after the booked date, so the transportation fee set by our team may be deducted from your down payment before it is refunded.';
export const NOTHING_TO_REFUND_NOTE = 'You have not paid a down payment for this booking, so there is nothing to refund.';

// The single sentence for this booking: the fee rule on or after the booked date (down payment on file or waiting to be checked), the full refund
// before it, or nothing to refund when no down payment was sent.
export function cancelRuleNote(booking, todayKey) {
  const sent = booking && ['to_verify', 'partially_paid', 'fully_paid'].includes(booking.paymentStatus);
  if (!sent) return NOTHING_TO_REFUND_NOTE;
  return showsSameDayWarning(booking, todayKey) ? TRANSPORT_FEE_NOTE : FULL_REFUND_NOTE;
}
