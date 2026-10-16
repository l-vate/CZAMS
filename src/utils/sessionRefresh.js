import { getSession, clearSession, setSessionNotice, applyFreshUser, sessionEndMessage, REFRESH_MIN_GAP_MS } from './session.js';

// Keeps the user saved in the browser (name, role and so on) in step with the server. The saved role is what
// the route guard reads, so if an admin changes someone's role, or deactivates them, the browser must hear it:
// after a 403, and when the app starts. Everything it touches is passed in, so it is tested without a browser.
//
//   storage   { getItem, setItem }       where the saved user lives
//   fetchFn   fetch                      used to call GET /api/users/me
//   apiBase   the API's base address
//   assign    (path) => void             goes to another page (window.location.assign)
//   now       () => milliseconds
export function createSessionRefresher({ storage, fetchFn, apiBase, assign, now = () => Date.now() }) {
  let inFlight = null;
  let lastAt = 0;

  const save = (user) => {
    try {
      storage.setItem('user', JSON.stringify(user));
    } catch {
      // storage unavailable: the guard falls back to the next login
    }
  };

  return function refreshSession({ force = false } = {}) {
    const { token, user } = getSession();
    if (!token) return Promise.resolve(null);
    if (inFlight) return inFlight;
    if (!force && now() - lastAt < REFRESH_MIN_GAP_MS) return Promise.resolve(null);
    lastAt = now();

    inFlight = (async () => {
      try {
        const res = await fetchFn(`${apiBase}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);

        // the account is gone, deactivated, or the token no longer works: sign out
        const endMessage = sessionEndMessage(res.status, data?.message, true);
        if (endMessage) {
          clearSession();
          setSessionNotice(endMessage);
          assign('/login');
          return null;
        }
        if (!res.ok) return null;

        const result = applyFreshUser(user, data);
        save(result.user);
        // the role changed: leave the pages of the old role, the guard would refuse them now
        if (result.roleChanged) assign(result.redirectTo);
        return result.user;
      } catch {
        return null; // offline or the server is down: keep what is saved
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
