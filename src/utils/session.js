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
