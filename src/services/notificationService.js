import { request } from './apiClient';

export function listNotifications() {
  return request('/api/notifications');
}

export function markNotificationRead(notificationId) {
  return request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead() {
  return request('/api/notifications/read-all', { method: 'PATCH' });
}
