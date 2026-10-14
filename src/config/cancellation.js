// What a customer is told about cancelling on the day of the service, in one place, so the question before cancelling and the answer after
// it use the same words. The amount of the deduction is set by an admin for each refund; only the rule is written here.
// Plain functions and strings, no framework, so the tests load this file on its own.

// The rule itself: on the day of the service, a dispatch/transportation cost comes off the down payment before it is refunded.
export const SAME_DAY_DEDUCTION_CLAUSE = "a dispatch/transportation cost will be deducted from your down payment before it's refunded";

// Shown in the "Cancel this booking?" dialog, before the customer confirms.
export const SAME_DAY_CANCEL_WARNING = `You are cancelling on the same day as your scheduled service, so ${SAME_DAY_DEDUCTION_CLAUSE}.`;

// Shown after cancelling, with the down payment amount on file (text such as "₱300").
export const sameDayCancelledMessage = (amountText) => `Since this was cancelled on the same day as your scheduled service, a dispatch/transportation cost will be deducted from your down payment of ${amountText} before it's refunded.`;

// Whether the warning applies: the booking is for today (a Manila day key) and a down payment is on file or waiting to be checked.
export function showsSameDayWarning(booking, todayKey) {
  if (!booking || !todayKey) return false;
  return booking.date === todayKey && ['to_verify', 'partially_paid', 'fully_paid'].includes(booking.paymentStatus);
}
