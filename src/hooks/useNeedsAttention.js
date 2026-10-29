import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getNeedsAttention } from '../services/needsAttentionService';
import { ROLE } from '../constants/roles';

// One shared copy of the "Needs attention" answer for the whole admin portal: the dashboard panel and the sidebar badge both read it, so the
// server is asked once, not once per place. It is asked again when the admin comes back to the tab and every 60 seconds while something is
// using it, and not at all while the tab is hidden. A refresh keeps showing the old answer until the new one arrives (no flicker). Only an
// admin ever asks.
export const REFRESH_MS = 60000;

let state = { status: 'idle', data: null, error: false, refreshing: false };
const listeners = new Set();
let users = 0;
let timer = null;
let inFlight = false;

const emit = () => listeners.forEach((l) => l());
const set = (patch) => { state = { ...state, ...patch }; emit(); };

export function isAdminUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.role === ROLE.ADMIN;
  } catch {
    return false;
  }
}

async function load() {
  if (inFlight || !isAdminUser()) return;
  inFlight = true;
  set(state.data ? { refreshing: true } : { status: 'loading', error: false });
  try {
    const data = await getNeedsAttention();
    if (!data || !data.groups) throw new Error('Unexpected reply');
    set({ status: 'ready', data, error: false, refreshing: false });
  } catch {
    // an error with data already on screen keeps the old answer and says nothing loud; the next refresh tries again
    set(state.data ? { refreshing: false } : { status: 'error', error: true, refreshing: false });
  } finally {
    inFlight = false;
  }
}

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function startTimer() {
  if (timer || hidden()) return;
  timer = setInterval(load, REFRESH_MS);
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}
function onVisibility() {
  if (hidden()) {
    stopTimer();
  } else if (users > 0) {
    load();
    startTimer();
  }
}

function attach() {
  users += 1;
  if (users === 1) {
    document.addEventListener('visibilitychange', onVisibility);
    if (!hidden()) { load(); startTimer(); }
  }
}
function detach() {
  users -= 1;
  if (users === 0) {
    document.removeEventListener('visibilitychange', onVisibility);
    stopTimer();
  }
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => state;

// { status: 'idle' | 'loading' | 'ready' | 'error', data, refreshing, retry }. For anyone but an admin it stays idle and asks for nothing.
export function useNeedsAttention() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const admin = isAdminUser();
  useEffect(() => {
    if (!admin) return undefined;
    attach();
    return detach;
  }, [admin]);
  const retry = useCallback(() => { load(); }, []);
  return admin ? { ...current, retry } : { status: 'idle', data: null, error: false, refreshing: false, retry };
}

// Forget everything and optionally start from a given answer (a sign out should not leave the old answer for the next person; the tests
// use it to show the panel in a known state).
export function resetNeedsAttention(next) {
  stopTimer();
  state = next ? { status: 'ready', data: null, error: false, refreshing: false, ...next } : { status: 'idle', data: null, error: false, refreshing: false };
  emit();
}
