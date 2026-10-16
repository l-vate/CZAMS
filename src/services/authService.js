import { request, upload } from './apiClient';

// Public: { token, user }.
export function login(credentials) {
  return request('/api/auth/login', { method: 'POST', body: credentials, auth: false });
}

// Public: { token, user }.
export function register(formData) {
  return request('/api/auth/register', { method: 'POST', body: formData, auth: false });
}

// Public: the active technicians' names, for the landing page search. No login, so no ids.
export function listPublicTechnicians() {
  return request('/api/auth/technicians', { auth: false });
}

// Signed in: the active technicians with their ids, for the booking forms' preferred technician list.
export function listTechniciansForBooking() {
  return request('/api/auth/technicians');
}

export function updateProfile(fields) {
  return request('/api/auth/profile', { method: 'PUT', body: fields });
}

// `file` is a File from an <input type="file">. Resolves to { user }.
export function uploadProfilePhoto(file) {
  const formData = new FormData();
  formData.append('photo', file);
  return upload('/api/auth/profile/photo', formData);
}

export function changePassword(passwords) {
  return request('/api/auth/change-password', { method: 'PUT', body: passwords });
}

export function deleteAccount() {
  return request('/api/auth/account', { method: 'DELETE' });
}
