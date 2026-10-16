import { request } from './apiClient';

// Which technicians are free for a booking's date and time block.
export function getTeamAvailability({ date, time, excludeBookingId }) {
  return request(`/api/teams/availability?date=${date}&time=${encodeURIComponent(time)}&excludeBookingId=${excludeBookingId}`);
}
