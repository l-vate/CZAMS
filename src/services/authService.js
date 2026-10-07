import { request, upload } from './apiClient';

// Public: { token, user }.
export function login(credentials) {
  return request('/api/auth/login', { method: 'POST', body: credentials, auth: false });
}

// Public: { token, user }.
export function register(formData) {
  return request('/api/auth/register', { method: 'POST', body: formData, auth: false });
}

// Public: the active technicians shown on the landing page and booking forms.
export function listPublicTechnicians() {
  return request('/api/auth/technicians', { auth: false });
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
