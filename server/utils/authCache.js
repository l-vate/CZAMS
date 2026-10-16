// A very short memory of each account's role and active flag, so the auth middleware can look the
// account up on every request without a database read for every single call a page makes.
// Entries live for a few seconds. When an admin changes an account the entry is dropped at once
// (see clearAuthCache), so a role change or a deactivation takes effect on the next request
// instead of waiting for the token to expire. `now` is a parameter so tests can use a fake clock.
const DEFAULT_TTL_MS = 5000;

function createAuthCache({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const entries = new Map();
  return {
    get(id) {
      const entry = entries.get(id);
      if (!entry) return null;
      if (now() - entry.at >= ttlMs) {
        entries.delete(id);
        return null;
      }
      return entry.value;
    },
    set(id, value) {
      entries.set(id, { value, at: now() });
    },
    clear(id) {
      if (id === undefined) entries.clear();
      else entries.delete(String(id));
    },
    get size() {
      return entries.size;
    },
  };
}

const sharedCache = createAuthCache();

module.exports = { createAuthCache, authCache: sharedCache, clearAuthCache: (id) => sharedCache.clear(id) };
