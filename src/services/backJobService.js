import { ApiError, request } from './apiClient';

// Admin: every back job (warranty claim).
export function listBackJobs() {
  return request('/api/backjobs');
}

// Customer: the back job reported on one of their bookings (404 when there is none).
// Resolves to null when there is none: that is the normal case, not an error.
export async function getBackJobForBooking(bookingId) {
  try {
    return await request(`/api/backjobs/booking/${bookingId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function reportBackJob({ bookingId, issueDescription }) {
  return request('/api/backjobs', { method: 'POST', body: { bookingId, issueDescription } });
}

// Admin: mark a back job report as reviewed.
export function markBackJobReviewed(backJobId) {
  return request(`/api/backjobs/${backJobId}/review`, { method: 'PATCH' });
}
