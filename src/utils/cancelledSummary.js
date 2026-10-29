// What a customer is told about a cancelled booking: who cancelled it, when, why (when the owner did), and exactly what happens to the down
// payment, in words that state the amount and the next step. Used by the confirmation screen right after cancelling and by the read-only
// details view, so both say the same thing. Plain functions, no framework, so the tests load this file on its own.
import { sameDayCancelledMessage } from '../config/cancellation';
import { formatPeso } from './bookingPricing';

export const NO_DOWN_PAYMENT_TEXT = "No down payment was on file for this booking, so there's nothing to refund.";
export const PROOF_WAITING_TEXT = 'Your down payment proof is still being checked. If it is verified, we will refund it and tell you here and in the app.';

// Who cancelled it, in a sentence for the customer.
export function cancelledByText(booking) {
  if (booking?.expiredBySystem) return 'This booking expired: it was cancelled automatically because it was not confirmed by the owner before the service day started.';
  if (booking?.ownerCancelled) return 'The owner cancelled this booking because we could not supply or serve it.';
  if (booking?.cancelledBy === 'customer') return 'You cancelled this booking.';
  if (booking?.cancelledBy === 'admin') return 'Cancelled by the owner.';
  return 'This booking was cancelled.';
}

// What happens to the money: one paragraph that states the amount and what comes next.
export function refundText(booking) {
  const refund = booking?.refund;
  if ((!refund || refund.status === 'None') && booking?.expiredBySystem) return 'No payment was made, so there is nothing to refund.';
  if (!refund || refund.status === 'None') {
    return booking?.paymentStatus === 'to_verify' ? PROOF_WAITING_TEXT : NO_DOWN_PAYMENT_TEXT;
  }
  const paid = formatPeso(refund.downPaymentAmount || 0);
  const fee = Number(refund.dispatchDeduction) || 0;
  if (refund.status === 'Rejected') {
    return `Your refund request was not approved: ${refund.rejectionReason || 'the payment did not go through'}${/[.!?]$/.test(refund.rejectionReason || '') ? '' : '.'} You can contact the owner if you think this is a mistake.`;
  }
  if (refund.paymentUnverified) {
    return `We received your refund request for your down payment of ${paid}. Your payment proof is still being checked: once our team confirms the payment came through, we will send the refund. If the payment did not go through, there is nothing to refund and the request cannot be approved. You will be told here and in the app.`;
  }
  if (refund.status === 'Processed') {
    const sent = formatPeso(refund.refundableAmount ?? 0);
    const feeNote = fee > 0 ? ` A transportation fee of ${formatPeso(fee)} was deducted from your down payment of ${paid}${refund.dispatchReason ? ` (${refund.dispatchReason})` : ''}.` : '';
    const adjusted = refund.adjustmentReason ? ` It was adjusted from ${formatPeso(refund.computedAmount ?? 0)}. Reason: ${refund.adjustmentReason}.` : '';
    return `Your refund of ${sent} has been sent.${feeNote}${adjusted} Please confirm below once it arrives.`;
  }
  if (refund.ownerInitiated) {
    return `Your whole down payment of ${paid} will be refunded, with no transportation fee. Our team will send it, and you will be told here and in the app when it is sent.`;
  }
  if (refund.isSameDay) {
    if (Number.isFinite(refund.refundableAmount)) {
      return `Your refund is ${formatPeso(refund.refundableAmount)}: your down payment of ${paid} minus a transportation fee of ${formatPeso(fee)}${refund.dispatchReason ? ` (${refund.dispatchReason})` : ''}. Our team will send it, and you will be told here and in the app when it is sent.`;
    }
    return `${sameDayCancelledMessage(paid)} Our team will decide the fee and then send the refund, and you will be told here and in the app.`;
  }
  return `Your down payment of ${paid} will be refunded in full. Our team will review it and send the refund, and you will be told here and in the app when it is sent.`;
}

// The figures for the details view: [[label, value]] for the money side of a cancelled booking. Empty when there was no refund case.
export function refundFigures(booking) {
  const refund = booking?.refund;
  if (!refund || refund.status === 'None') return [];
  const rows = [['Down payment', formatPeso(refund.downPaymentAmount || 0)]];
  const fee = Number(refund.dispatchDeduction) || 0;
  if (refund.isSameDay && (fee > 0 || Number.isFinite(refund.refundableAmount))) {
    rows.push(['Transportation fee', formatPeso(fee)]);
    if (refund.dispatchReason) rows.push(['Reason for the fee', refund.dispatchReason]);
  }
  if (refund.ownerInitiated) rows.push(['Transportation fee', refund.expired ? 'None (the booking expired)' : 'None (the owner cancelled)']);
  if (Number.isFinite(refund.refundableAmount)) rows.push(['Refund amount', formatPeso(refund.refundableAmount)]);
  rows.push(['Refund status', refund.status === 'Processed' ? 'Sent' : refund.status === 'Rejected' ? 'Not approved' : refund.paymentUnverified ? 'Waiting for the payment to be checked' : 'Being processed']);
  if (refund.status === 'Rejected' && refund.rejectionReason) rows.push(['Reason', refund.rejectionReason]);
  return rows;
}
