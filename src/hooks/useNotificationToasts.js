import { useCallback, useEffect, useRef, useState } from 'react';
import { listNotifications } from '../services/notificationService';
import { useRefreshOnFocus } from './useRefreshOnFocus';

// Tells the person about a notification that arrives while the app is open (a new job, a changed or cancelled job), once, as a top message
// with a button to open it. It looks at the same moments the rest of the app refreshes: when the tab is shown again and every 2 minutes
// (hooks/useRefreshOnFocus.js). What was already there when the page opened is remembered without a message, and each notification is
// announced only once, however many refreshes follow. Returns { toast, dismiss }: toast is the notification to show (the newest new one) or null.
export const NOTIFICATIONS_CHANGED = 'czams-notifications-changed';

// The new, unread notifications in `list` that were not seen before, oldest first. Pure.
export function newNotifications(list, seenIds) {
  return (Array.isArray(list) ? list : [])
    .filter((n) => n && n._id && !n.read && !seenIds.has(n._id))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

export function useNotificationToasts() {
  const seen = useRef(null); // null until the first load has been remembered
  const [toast, setToast] = useState(null);

  const check = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    let list;
    try {
      list = await listNotifications();
    } catch {
      return; // keep what is on screen; the next refresh tries again
    }
    if (!Array.isArray(list)) return;
    if (seen.current === null) {
      seen.current = new Set(list.map((n) => n._id)); // the page just opened: these are old news
      return;
    }
    const fresh = newNotifications(list, seen.current);
    list.forEach((n) => seen.current.add(n._id));
    if (fresh.length === 0) return;
    setToast(fresh[fresh.length - 1]); // the newest one; the bell lists the others
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)); // the bell's badge catches up
  }, []);

  useEffect(() => {
    check();
  }, [check]);
  useRefreshOnFocus(check);

  return { toast, dismiss: () => setToast(null) };
}
