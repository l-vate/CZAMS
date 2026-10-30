// One scroll lock for everything that covers the page: modals, dialogs and the phone menu drawers. A counter, so stacked ones keep the
// page locked until the last one closes. The page is held in place with a fixed body at the same offset, which also stops the background
// on iOS Safari, and the exact scroll position comes back on release. `env` is passed in so this is tested without a browser.
export function createScrollLock(env) {
  let count = 0;
  let saved = null;

  const lock = () => {
    count += 1;
    if (count > 1) return;
    const { win, doc } = env;
    const root = doc.documentElement;
    const body = doc.body;
    const scrollY = win.scrollY || root.scrollTop || 0;
    // the width the scrollbar takes on a desktop: kept as padding so the page does not jump sideways when it disappears
    const scrollbar = Math.max(0, win.innerWidth - root.clientWidth);
    saved = { scrollY, style: { position: body.style.position, top: body.style.top, width: body.style.width, paddingRight: body.style.paddingRight } };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    root.classList.add('scroll-locked');
  };

  const unlock = () => {
    if (count === 0) return;
    count -= 1;
    if (count > 0 || !saved) return;
    const { win, doc } = env;
    Object.assign(doc.body.style, saved.style);
    doc.documentElement.classList.remove('scroll-locked');
    win.scrollTo({ top: saved.scrollY, left: 0, behavior: 'instant' });
    saved = null;
  };

  return { lock, unlock, get count() { return count; } };
}

const MODAL_SELECTOR = '.modal-overlay, .cbd-overlay, .sdm-overlay, .ann-modal-overlay, .svc-modal-overlay, [role="dialog"][aria-modal="true"]';
const DRAWER_SELECTOR = '.dashboard-shell.sidebar-open, .navbar.nav-open';

// "Something is open over the page": a modal, a dialog or a phone menu drawer.
export const isCoverOpen = (doc) => doc.querySelector(`${MODAL_SELECTOR}, ${DRAWER_SELECTOR}`) !== null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The open modal that sits on top (the last one in the page), or null when nothing but a drawer, or nothing, is open.
export function topModal(doc) {
  const all = doc.querySelectorAll(MODAL_SELECTOR);
  return all.length ? all[all.length - 1] : null;
}

export const focusableIn = (el) => Array.from(el.querySelectorAll(FOCUSABLE)).filter((node) => node.getAttribute('aria-hidden') !== 'true');

// Tab and Shift+Tab stay inside the modal: from the last control to the first, and the other way round. Returns true when it moved the focus.
export function trapTab(event, modal, doc) {
  const items = focusableIn(modal);
  if (items.length === 0) { event.preventDefault(); return true; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = doc.activeElement;
  if (!modal.contains(active)) { event.preventDefault(); first.focus(); return true; }
  if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); return true; }
  if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); return true; }
  return false;
}
