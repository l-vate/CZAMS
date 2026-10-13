import { request } from './apiClient';

// Upcoming closed dates as [{ date, reason }] (an admin also gets affectedBookings: the number of
// Pending or Approved bookings already on that date).
export function listClosures() {
  return request('/api/closures');
}

// Public (no login): the same list for the landing page.
export function listPublicClosures() {
  return request('/api/closures/public', { auth: false });
}

// Admin: close a date. `date` is YYYY-MM-DD.
export function addClosure({ date, reason }) {
  return request('/api/closures', { method: 'POST', body: { date, reason } });
}

// Admin: open a date again.
export function deleteClosure(date) {
  return request(`/api/closures/${date}`, { method: 'DELETE' });
}
