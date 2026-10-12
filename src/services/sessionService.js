import { API_BASE } from '../config/api';
import { createSessionRefresher } from '../utils/sessionRefresh';

// The real one: the browser's localStorage, fetch and navigation. See utils/sessionRefresh.js.
export const refreshSession = createSessionRefresher({
  storage: { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) },
  fetchFn: (...args) => fetch(...args),
  apiBase: API_BASE,
  assign: (path) => window.location.assign(path),
});
