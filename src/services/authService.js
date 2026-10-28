import { request, upload } from './apiClient';

// Public: { token, user }.
export function login(credentials) {
  return request('/api/auth/login', { method: 'POST', body: credentials, auth: false });
}

// Public: { token, user }.
export function register(formData) {
  return request('/api/auth/register', { method: 'POST', body: formData, auth: false });
}

// Public: { message }, the same for every email.
export function requestPasswordReset(email) {
  return request('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
}

// Public: { message }. `token` comes from the emailed link.
export function resetPassword({ token, password }) {
  return request('/api/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
}

// Public: { valid }. Whether the emailed reset link can still be used. Asking does not use it up.
export function checkResetLink(token) {
  return request('/api/auth/reset-password/check', { method: 'POST', body: { token }, auth: false });
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

// Emails the signed-in user a link to choose a new password.
export function requestPasswordChangeEmail() {
  return request('/api/auth/change-password/email', { method: 'POST' });
}

export function deleteAccount() {
  return request('/api/auth/account', { method: 'DELETE' });
}
