import { request } from './apiClient';

// Admin: every announcement.
export function listAnnouncements() {
  return request('/api/announcements');
}

// Public: the announcements currently shown on the landing page and technician dashboard.
export function listPublicAnnouncements() {
  return request('/api/announcements/public', { auth: false });
}

export function createAnnouncement(announcement) {
  return request('/api/announcements', { method: 'POST', body: announcement });
}

export function updateAnnouncement(announcementId, announcement) {
  return request(`/api/announcements/${announcementId}`, { method: 'PUT', body: announcement });
}

export function deleteAnnouncement(announcementId) {
  return request(`/api/announcements/${announcementId}`, { method: 'DELETE' });
}
