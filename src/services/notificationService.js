import { request } from './apiClient';

// `limit` asks for more than the usual newest 30 (the server allows up to 200).
export function listNotifications(limit) {
  return request(limit ? `/api/notifications?limit=${limit}` : '/api/notifications');
}

export function markNotificationRead(notificationId) {
  return request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
}

// `filter` is { types } or { exceptTypes } to mark one category only (see readFilterFor); with none, every notification.
export function markAllNotificationsRead(filter) {
  return request('/api/notifications/read-all', { method: 'PATCH', body: filter });
}
