import { request, upload, orFallback } from './apiClient';

const booking = (bookingId) => `/api/bookings/${bookingId}`;

// ---- Lists ----
// Admin: every booking.
export function listBookings() {
  return request('/api/bookings');
}

// The logged-in customer's own bookings.
export function listMyBookings() {
  return request('/api/bookings/mine');
}

// The logged-in technician's jobs (each carries `myRole`).
export function listTechnicianJobs() {
  return request('/api/bookings/technician/mine');
}

export function getTechnicianStats() {
  return request('/api/bookings/technician/mine/stats');
}

// Admin: how many upcoming and today's bookings each technician has.
export function getTechnicianWorkload() {
  return request('/api/bookings/technician-workload');
}

// Admin: Pending requests in handling order.
export function getQueue() {
  return request('/api/bookings/queue');
}

// Public: the overall rating summary shown on the landing page.
export function getPublicFeedbackSummary() {
  return request('/api/bookings/public/feedback-summary', { auth: false });
}

// Admin: the customer feedback left for one technician.
export function getTechnicianFeedback(technicianId) {
  return request(`/api/bookings/technicians/${technicianId}/feedback`);
}

// Technicians already booked for that date and time block: { busyTechIds }.
export function getBusyTechnicians(date, time) {
  return request(`/api/bookings/busy-technicians?date=${date}&time=${time}`);
}

// ---- One booking ----
export function getBooking(bookingId) {
  return request(booking(bookingId));
}

// Admin: other bookings with the same payment reference number, as [{ bookingId, reference }].
// The badge is only a warning, so a failed lookup shows no badge.
export async function getReferenceDuplicates(bookingId) {
  const result = await orFallback(request(`${booking(bookingId)}/reference-duplicates`), { duplicates: [] });
  return result.duplicates || [];
}

// `formData` is the multipart booking form (with optional proof and discount ID files).
export function createBooking(formData) {
  return upload('/api/bookings', formData);
}

export function cancelBooking(bookingId) {
  return request(`${booking(bookingId)}/cancel`, { method: 'PATCH' });
}

export function rescheduleBooking(bookingId, { date, time }) {
  return request(`${booking(bookingId)}/reschedule`, { method: 'PATCH', body: { date, time } });
}

// Ask for the Senior Citizen / PWD discount on an existing booking. `type` is 'Senior' | 'PWD',
// `idFile` the photo of a valid ID.
export function requestDiscount(bookingId, { type, idFile }) {
  const formData = new FormData();
  formData.append('discountType', type);
  formData.append('discountId', idFile);
  return upload(`${booking(bookingId)}/discount/request`, formData, { method: 'PATCH' });
}

export function submitFeedback(bookingId, { rating, text }) {
  return request(`${booking(bookingId)}/feedback`, { method: 'PATCH', body: { rating, text } });
}

// ---- Admin actions ----
// Status, payment status and charges, whatever the body carries.
export function adminUpdateBooking(bookingId, body) {
  return request(`${booking(bookingId)}/admin-update`, { method: 'PATCH', body });
}

export function assignBooking(bookingId, assignments) {
  return request(`${booking(bookingId)}/assign`, { method: 'PATCH', body: { assignments } });
}

export function autoAssignBooking(bookingId) {
  return request(`${booking(bookingId)}/auto-assign`, { method: 'POST' });
}

// `action` is 'up' | 'down' | 'top'. Resolves to the reordered queue.
export function moveInQueue(bookingId, action) {
  return request(`${booking(bookingId)}/queue`, { method: 'PATCH', body: { action } });
}

export function uploadUnitPurchaseProof(bookingId, file) {
  const formData = new FormData();
  formData.append('proof', file);
  return upload(`${booking(bookingId)}/unit-purchase-proof`, formData, { method: 'PATCH' });
}

export function rescheduleAfterDisruption(bookingId, { date, time }) {
  return request(`${booking(bookingId)}/disruption/reschedule`, { method: 'PATCH', body: { date, time } });
}

// decision: 'approve' | 'reject'. `reason` is only sent when rejecting.
export function decideDiscount(bookingId, decision, reason) {
  return request(`${booking(bookingId)}/discount/${decision}`, {
    method: 'PATCH',
    body: decision === 'reject' ? { reason } : {},
  });
}

// decision: 'approve' | 'deny'.
export function decideReschedule(bookingId, decision) {
  return request(`${booking(bookingId)}/reschedule/${decision}`, { method: 'PATCH' });
}

// decision: 'approve' | 'deny'.
export function decideExtension(bookingId, decision) {
  return request(`${booking(bookingId)}/extension/${decision}`, { method: 'PATCH' });
}

// ---- Technician actions ----
export function reportDisruption(bookingId, reason) {
  return request(`${booking(bookingId)}/disruption/report`, { method: 'PATCH', body: { reason } });
}

export function requestExtension(bookingId, reason) {
  return request(`${booking(bookingId)}/extension/request`, { method: 'PATCH', body: { reason } });
}
