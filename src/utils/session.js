import { ROLE } from '../constants/roles.js';

// The login session kept in localStorage: the token and the user the login returned.
// Every sign-out path (the Log Out buttons, an expired or deactivated session) goes through
// clearSession so nothing private is left behind.
export function clearSession() {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch {
    // storage can be unavailable (private window); nothing to clear then
  }
}

// The saved session, or { token: null, user: null } when there is none or it cannot be read.
export function getSession() {
  try {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    return token && user && typeof user === 'object' ? { token, user } : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

// Each role's own home page.
export function homeFor(role) {
  if (role === ROLE.ADMIN) return '/admin/dashboard';
  if (role === ROLE.STAFF) return '/staff/dashboard';
  return '/customer/dashboard';
}

// Where a visitor to a role's pages should be sent instead, or null when they may stay.
// No session goes to the login page; a signed-in person on another role's pages goes home.
export function redirectFor(session, requiredRole) {
  if (!session?.token || !session?.user) return '/login';
  if (session.user.role !== requiredRole) return homeFor(session.user.role);
  return null;
}

// A short message for the login page after a forced sign-out ("Your session has expired").
const NOTICE_KEY = 'sessionNotice';

export function setSessionNotice(message) {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
  } catch {
    // the message is a courtesy; signing out matters more
  }
}

export function takeSessionNotice() {
  try {
    const message = sessionStorage.getItem(NOTICE_KEY) || '';
    sessionStorage.removeItem(NOTICE_KEY);
    return message;
  } catch {
    return '';
  }
}

// Whether a failed response means the session itself is no good: an expired or invalid token
// (401), or an account an admin deactivated (403 with the deactivated message). Only counts for a
// request that carried a token, so a wrong password at login is never read as an expired session.
export function sessionEndMessage(status, message, hadToken) {
  if (!hadToken) return null;
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403 && /deactivated/i.test(message || '')) return message;
  return null;
}

// ---- keeping the saved user fresh

// The fields of the saved user that the server can change behind the browser's back. Anything else the saved
// user holds is kept as it is.
const FRESH_FIELDS = ['name', 'email', 'role', 'phone', 'address', 'profileImage', 'clientType', 'position', 'companyName', 'representativeName', 'createdAt'];

// The saved user updated from a fresh /api/users/me answer, and what to do about it:
//   { user, roleChanged, redirectTo }  (redirectTo is the new role's home when the role changed, otherwise null)
// The answer carries `_id`; the saved user keeps `id`, as the login gave it.
export function applyFreshUser(saved, fresh) {
  if (!fresh || typeof fresh !== 'object' || !fresh.role) return { user: saved, roleChanged: false, redirectTo: null };
  const user = { ...(saved || {}), id: fresh._id || fresh.id || saved?.id };
  FRESH_FIELDS.forEach((field) => {
    if (fresh[field] !== undefined) user[field] = fresh[field];
  });
  const roleChanged = !!saved?.role && saved.role !== fresh.role;
  return { user, roleChanged, redirectTo: roleChanged ? homeFor(fresh.role) : null };
}

// Whether a failed request should trigger a refresh of the saved user: a 403 that is not the deactivated-account
// message (that one signs out instead), at most once every 10 seconds.
export const REFRESH_MIN_GAP_MS = 10000;
export function shouldRefreshAfterFailure({ status, message, lastRefreshAt = 0, now = Date.now() }) {
  if (status !== 403) return false;
  if (/deactivated/i.test(message || '')) return false;
  return now - lastRefreshAt >= REFRESH_MIN_GAP_MS;
}
