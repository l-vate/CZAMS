// What a customer is told about cancelling, in one place, so the question before cancelling, the answer after it, the landing page and the chat
// all say the same thing. Plain strings and one small function, no framework, so the tests load this file on its own.
//
// The rule (E34): a customer can cancel a Pending or Approved booking, and the whole down payment is refunded, on any date. Once the booking is
// In Progress the customer cannot cancel it online. A part of the down payment is kept only when the office cancels because the customer was not
// available at the address or the technicians were already on the way; the office decides that amount, never the customer's own cancellation.

// The landing page FAQ and the chat answer.
export const CANCEL_POLICY_NOTE = 'You can cancel a Pending or Approved booking before the service starts, and your down payment is refunded in full. Once the booking is In Progress it can no longer be cancelled online: please contact us.';

// Shown on a booking that has started, where the Cancel button used to be.
export const STARTED_CANCEL_NOTE = 'The service has already started, so it can no longer be cancelled online. Please contact us directly.';

// Shown in the "Cancel this booking?" dialog: the one sentence that applies to this booking.
export const FULL_REFUND_NOTE = 'Your verified down payment will be refunded in full.';
export const NOTHING_TO_REFUND_NOTE = 'You have not paid a down payment for this booking, so there is nothing to refund.';

// The single sentence for this booking: the full refund when a down payment was sent (or is waiting to be checked), else nothing to refund.
export function cancelRuleNote(booking) {
  const sent = booking && ['to_verify', 'partially_paid', 'fully_paid'].includes(booking.paymentStatus);
  return sent ? FULL_REFUND_NOTE : NOTHING_TO_REFUND_NOTE;
}
