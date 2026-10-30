// When a new page should start at the top. Pure, so it is tested on its own.
//
//   'top'   a push or replace to another path: the new page starts at the top
//   'hash'  the address has a #section: go to that element (the landing page units link, a deep link)
//   'none'  only the query string changed (filters, sort, tabs, search), or the browser Back or Forward button was used
//
// Back and Forward stay with the browser, so a person returns to where they were.
export function routeScrollAction(prev, next, navigationType) {
  if (navigationType === 'POP') return 'none';
  if (next.hash) return prev.pathname === next.pathname && prev.hash === next.hash ? 'none' : 'hash';
  if (prev.pathname !== next.pathname) return 'top';
  return 'none';
}

// The inner containers a layout could scroll instead of the window.
export const INNER_SCROLL_SELECTOR = '[data-scroll-root], .dashboard-main, .dashboard-body';

// Instant, never smooth, whatever the page's own scroll-behavior or the reduced motion setting says.
export function resetScroll(win = window, doc = document) {
  win.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  doc.querySelectorAll(INNER_SCROLL_SELECTOR).forEach((el) => {
    if (el.scrollTop !== 0) el.scrollTop = 0;
  });
}

// Goes to the element a #hash names; true when it was found.
export function scrollToHash(hash, doc = document) {
  const id = decodeURIComponent((hash || '').replace(/^#/, ''));
  if (!id) return false;
  const el = doc.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'instant', block: 'start' });
  return true;
}
