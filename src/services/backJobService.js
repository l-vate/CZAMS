import { ApiError, request } from './apiClient';

// Admin: every back job (warranty claim).
export function listBackJobs() {
  return request('/api/backjobs');
}

// Customer: the back job reported on one of their bookings. The server answers 200 with null when there is none (the normal case, not
// an error); a 404 from an older server is read the same way.
export async function getBackJobForBooking(bookingId) {
  try {
    return await request(`/api/backjobs/booking/${bookingId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// `media` is the optional photo or video (a File).
export function reportBackJob({ bookingId, issueDescription, media }) {
  const body = new FormData();
  body.append('bookingId', bookingId);
  body.append('issueDescription', issueDescription);
  if (media) body.append('problemMedia', media);
  return request('/api/backjobs', { method: 'POST', body });
}

// Admin: mark a back job report as reviewed.
export function markBackJobReviewed(backJobId) {
  return request(`/api/backjobs/${backJobId}/review`, { method: 'PATCH' });
}
