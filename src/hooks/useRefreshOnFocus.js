import { useEffect, useRef } from 'react';

export const REFRESH_EVERY_MS = 2 * 60 * 1000;

// Calls `refresh` when the tab becomes visible again and every 2 minutes while it is visible, so a change made
// elsewhere (such as the admin reassigning a job) shows without a manual reload. The first load is the page's own.
// `refresh` should keep what is already on screen if it fails.
export function useRefreshOnFocus(refresh, everyMs = REFRESH_EVERY_MS) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') latest.current();
    };
    const timer = setInterval(run, everyMs);
    // eslint-disable-next-line no-restricted-syntax -- tab shown again: removed in this effect's cleanup
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
  }, [everyMs]);
}
