import { useEffect } from 'react';
import { createScrollLock, isCoverOpen, topModal, trapTab, focusableIn } from '../utils/scrollLock';

// Mounted once (inside the router). It watches the page for anything that covers it (a modal, a dialog, a phone menu drawer) and, while one
// is open: holds the page behind it still, keeps Tab inside the top modal, moves the focus into it, and gives the focus back to what opened
// it. Watching the page, not each modal, means every modal is covered, the ones added later too, and a modal that disappears with its route
// releases the lock because its element is gone. Escape is left to each modal, as before.
function ModalManager() {
  useEffect(() => {
    const scroll = createScrollLock({ win: window, doc: document });
    let locked = false;
    let opener = null;
    let lastOutside = null;
    let hadModal = false;

    const rememberOutside = (event) => {
      if (!topModal(document) && event.target instanceof HTMLElement) lastOutside = event.target;
    };

    const sync = () => {
      const open = isCoverOpen(document);
      if (open && !locked) { scroll.lock(); locked = true; }
      if (!open && locked) { scroll.unlock(); locked = false; }

      const modal = topModal(document);
      if (modal && !hadModal) {
        opener = lastOutside;
        // after the modal's own autofocus has run: only move the focus in when it is not already inside
        requestAnimationFrame(() => {
          const current = topModal(document);
          if (!current || current.contains(document.activeElement)) return;
          const target = current.querySelector('[role="dialog"], [aria-modal="true"]') || current;
          const items = focusableIn(target);
          if (items.length > 0) items[0].focus({ preventScroll: true });
          else { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
        });
      }
      if (!modal && hadModal && opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
        opener = null;
      }
      hadModal = Boolean(modal);
    };

    const onKeyDown = (event) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const modal = topModal(document);
      if (!modal) return;
      trapTab(event, modal.querySelector('[role="dialog"], [aria-modal="true"]') || modal, document);
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    // eslint-disable-next-line no-restricted-syntax -- removed in this effect's cleanup
    document.addEventListener('focusin', rememberOutside);
    // eslint-disable-next-line no-restricted-syntax -- removed in this effect's cleanup
    document.addEventListener('keydown', onKeyDown);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', rememberOutside);
      document.removeEventListener('keydown', onKeyDown);
      while (scroll.count > 0) scroll.unlock();
    };
  }, []);

  return null;
}

export default ModalManager;
