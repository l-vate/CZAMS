// The rules of the public top bar's menu (components/public_navbar.jsx), kept apart so they can be tested on their own.

// The menu is open or closed. Only a toggle opens it; every other event closes it.
export function navMenuReducer(open, event) {
  if (event === 'toggle') return !open;
  return false;
}

// A pointer press at `target` is "outside" the menu unless it is inside the bar, or inside the search results popup (which is drawn
// outside the bar but belongs to the search box in the menu).
export function isOutsideMenu(target, bar) {
  if (!target || typeof target.closest !== 'function') return true;
  return !(bar && bar.contains(target)) && !target.closest('.nav-search-modal-overlay');
}
