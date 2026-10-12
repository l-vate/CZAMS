import { request } from './apiClient';
import { getSession, applyFreshUser } from '../utils/session';

// Admin: every user, or only one role ('staff' | 'customer').
export function listUsers(role) {
  return request(role ? `/api/users?role=${role}` : '/api/users');
}

// The logged-in customer's own record (includes their classification).
export function getMe() {
  return request('/api/users/me').then((data) => {
    // fresh data from the server: keep the saved user and role in step with it
    const { token, user } = getSession();
    if (token) {
      try {
        localStorage.setItem('user', JSON.stringify(applyFreshUser(user, data).user));
      } catch {
        // storage unavailable: nothing to update
      }
    }
    return data;
  });
}

// Admin: a customer's history (latest bookings, counts, total paid, feedback given).
export function getCustomerHistory(userId) {
  return request(`/api/users/${userId}/history`);
}

// The logged-in customer's own history summary.
export function getMyHistory() {
  return request('/api/users/me/history');
}

export function createUser(fields) {
  return request('/api/users', { method: 'POST', body: fields });
}

export function updateUser(userId, fields) {
  return request(`/api/users/${userId}`, { method: 'PUT', body: fields });
}

// `classification` is the manual override, or null to go back to automatic.
export function updateClassification(userId, classification) {
  return request(`/api/users/${userId}/classification`, { method: 'PATCH', body: { classification } });
}
