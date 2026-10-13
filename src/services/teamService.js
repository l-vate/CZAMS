import { request } from './apiClient';

export function listTeams() {
  return request('/api/teams');
}

export function createTeam(team) {
  return request('/api/teams', { method: 'POST', body: team });
}

// `fields` can be the whole team or just the changed part (e.g. { isActive }).
export function updateTeam(teamId, fields) {
  return request(`/api/teams/${teamId}`, { method: 'PUT', body: fields });
}

// Which teams and technicians are free for a booking's date and time block.
export function getTeamAvailability({ date, time, excludeBookingId }) {
  return request(`/api/teams/availability?date=${date}&time=${encodeURIComponent(time)}&excludeBookingId=${excludeBookingId}`);
}
