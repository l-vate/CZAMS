import { request } from './apiClient';

// Admin: every back job (warranty claim).
export function listBackJobs() {
  return request('/api/backjobs');
}

// Customer: the back job reported on one of their bookings (404 when there is none).
export function getBackJobForBooking(bookingId) {
  return request(`/api/backjobs/booking/${bookingId}`);
}

export function reportBackJob({ bookingId, issueDescription }) {
  return request('/api/backjobs', { method: 'POST', body: { bookingId, issueDescription } });
}

// Admin: mark a back job report as reviewed.
export function markBackJobReviewed(backJobId) {
  return request(`/api/backjobs/${backJobId}/review`, { method: 'PATCH' });
}
