import { request } from './apiClient';

// Every service (the booking forms use this; the token is sent when there is one).
export function listServices() {
  return request('/api/services');
}

// Admin: every service, including ones hidden from direct booking.
export function listAllServices() {
  return request('/api/services/admin/all');
}

// Public: the active services shown on the landing page.
export function listPublicServices() {
  return request('/api/services/public', { auth: false });
}

export function createService(service) {
  return request('/api/services', { method: 'POST', body: service });
}

export function updateService(serviceId, service) {
  return request(`/api/services/${serviceId}`, { method: 'PUT', body: service });
}

export function deleteService(serviceId) {
  return request(`/api/services/${serviceId}`, { method: 'DELETE' });
}
