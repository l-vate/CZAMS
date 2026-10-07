import { request } from './http';

// Public: [{ date, status, morning, afternoon }] for each day from `from` to `to` (YYYY-MM-DD).
export function getAvailability(from, to) {
  return request(`/api/availability/public?from=${from}&to=${to}`, { auth: false });
}
