// What a customer is told about cancelling on the day of the service, in one place, so the question before cancelling and the answer after
// it use the same words. The amount of the deduction is set by an admin for each refund; only the rule is written here.
// Plain functions and strings, no framework, so the tests load this file on its own.

// The rule itself: before the booked date the whole down payment is refunded; on the booked date a transportation fee, decided by the
// owner, may be deducted from it first.
export const SAME_DAY_DEDUCTION_CLAUSE = 'a transportation fee may be deducted from your down payment before it is refunded';

// Shown in the "Cancel this booking?" dialog, before the customer confirms.
export const SAME_DAY_CANCEL_WARNING = `You are cancelling on the booked day, so ${SAME_DAY_DEDUCTION_CLAUSE}. If you cancel on an earlier day, your down payment is refunded in full.`;

// Shown in the same dialog when the booking is not for today: the rule for both cases, so the customer knows it before confirming.
export const CANCEL_POLICY_NOTE = 'You can cancel before the service starts. If you cancel before the booked day, your down payment is refunded in full. Cancelling on the booked day may result in a transportation fee deducted from the down payment.';

// Shown after cancelling, with the down payment amount on file (text such as "₱300").
export const sameDayCancelledMessage = (amountText) => `Since this was cancelled on the booked day, a transportation fee may be deducted from your down payment of ${amountText} before it is refunded.`;

// Whether the warning applies: the booking is for today (a Manila day key) and a down payment is on file or waiting to be checked.
export function showsSameDayWarning(booking, todayKey) {
  if (!booking || !todayKey) return false;
  return booking.date === todayKey && ['to_verify', 'partially_paid', 'fully_paid'].includes(booking.paymentStatus);
}
