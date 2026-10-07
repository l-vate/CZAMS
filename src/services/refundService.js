import { request, upload } from './apiClient';

// Customer: report a problem with their refund.
export function flagRefund(bookingId, message) {
  return request(`/api/bookings/${bookingId}/refund/flag`, { method: 'PATCH', body: { message } });
}

// Admin: mark a customer's refund report as resolved.
export function resolveRefundFlag(bookingId) {
  return request(`/api/bookings/${bookingId}/refund/flag/resolve`, { method: 'PATCH' });
}

// Admin: record the refund. `dispatchDeduction` is only sent for a same-day cancellation.
export function processRefund(bookingId, { proof, dispatchDeduction }) {
  const formData = new FormData();
  formData.append('proof', proof);
  if (dispatchDeduction !== undefined) formData.append('dispatchDeduction', dispatchDeduction);
  return upload(`/api/bookings/${bookingId}/refund`, formData, { method: 'PATCH' });
}
