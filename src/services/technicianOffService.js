import { request } from './apiClient';

// Admin: the dates technicians are marked as not available.

// Upcoming entries as [{ _id, technician, technicianName, date, blocks, reason }].
export function listTechnicianOff() {
  return request('/api/technician-off');
}

// Mark technicians off on a date. `technicians` is a list of ids, `blocks` is ['Morning'], ['Afternoon'] or both. The answer lists the
// bookings those technicians already have then (bookingsInTheWay), which are left as they are.
export function setTechnicianOff({ technicians, date, blocks, reason }) {
  return request('/api/technician-off', { method: 'POST', body: { technicians, date, blocks, reason } });
}

// Mark a technician as available again (one entry from the list).
export function clearTechnicianOff(id) {
  return request(`/api/technician-off/${id}`, { method: 'DELETE' });
}
