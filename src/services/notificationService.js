import { request } from './apiClient';

// `limit` asks for more than the usual newest 30 (the server allows up to 200).
export function listNotifications(limit) {
  return request(limit ? `/api/notifications?limit=${limit}` : '/api/notifications');
}

// [{ type, total, unread }] for every kind the user has: exact counts for the tabs, whatever the length of the loaded list.
export function getNotificationCounts() {
  return request('/api/notifications/counts');
}

export function markNotificationRead(notificationId) {
  return request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
}

// `filter` is { types } or { exceptTypes } to mark one category only (see readFilterFor); with none, every notification.
export function markAllNotificationsRead(filter) {
  return request('/api/notifications/read-all', { method: 'PATCH', body: filter });
}
