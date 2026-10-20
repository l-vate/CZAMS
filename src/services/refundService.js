import { request, upload } from './apiClient';

// Customer: report a problem with their refund.
export function flagRefund(bookingId, message) {
  return request(`/api/bookings/${bookingId}/refund/flag`, { method: 'PATCH', body: { message } });
}

// Admin: mark a customer's refund report as resolved.
export function resolveRefundFlag(bookingId) {
  return request(`/api/bookings/${bookingId}/refund/flag/resolve`, { method: 'PATCH' });
}

// Customer: confirm the refund money arrived. Allowed once, after the refund is processed.
export function confirmRefundReceived(bookingId) {
  return request(`/api/bookings/${bookingId}/refund/received`, { method: 'PATCH' });
}

// Admin: record the refund. `dispatchDeduction` is only sent for a cancellation on or after the booked date.
// `finalAmount` and `adjustmentReason` are sent only when the admin changes the computed amount.
export function processRefund(bookingId, { proof, dispatchDeduction, dispatchReason, finalAmount, adjustmentReason }) {
  const formData = new FormData();
  formData.append('proof', proof);
  if (dispatchDeduction !== undefined) formData.append('dispatchDeduction', dispatchDeduction);
  if (dispatchReason) formData.append('dispatchReason', dispatchReason);
  if (finalAmount !== undefined) formData.append('finalAmount', finalAmount);
  if (adjustmentReason) formData.append('adjustmentReason', adjustmentReason);
  return upload(`/api/bookings/${bookingId}/refund`, formData, { method: 'PATCH' });
}
