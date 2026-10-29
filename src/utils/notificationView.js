// What the notifications page is showing: the tab (a category, All, or Needs action for an admin), the sort order and the Unread only switch.
// Plain functions (no framework, so the tests load this file on its own). The view lives in the address (?category=payments&sort=unread&unread=1)
// and is remembered for the browser session, so it comes back when the user returns to the page.
import { CATEGORY_ORDER } from '../constants/notificationCategories';
import { NEEDS_ACTION_TAB } from './notificationGroups';

export const SORTS = Object.freeze([
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'unread', label: 'Unread first' },
]);
export const DEFAULT_VIEW = Object.freeze({ tab: 'all', sort: 'newest', unread: false });
export const SESSION_KEY = 'czams.notifications.view';

const SORT_KEYS = SORTS.map((s) => s.key);
export const sortLabel = (sort) => (SORTS.find((s) => s.key === sort) || SORTS[0]).label;

const timeOf = (n) => new Date(n.createdAt).getTime() || 0;
const COMPARE = {
  newest: (a, b) => timeOf(b) - timeOf(a),
  oldest: (a, b) => timeOf(a) - timeOf(b),
  // unread to the top, then the newest first
  unread: (a, b) => Number(Boolean(a.read)) - Number(Boolean(b.read)) || timeOf(b) - timeOf(a),
};

// A sorted copy: the input is not changed. An unknown order is Newest first. Items that tie keep their order.
export function sortNotifications(notifications, sort = 'newest') {
  return [...notifications].sort(COMPARE[sort] || COMPARE.newest);
}

export const onlyUnread = (notifications) => notifications.filter((n) => !n.read);

// The tab names a page may show: All, a category, and Needs action for an admin only.
export function validTab(tab, isAdmin) {
  if (tab === 'all' || CATEGORY_ORDER.includes(tab)) return tab;
  if (tab === NEEDS_ACTION_TAB && isAdmin) return tab;
  return null;
}

// What the session remembered (nothing when the browser will not say).
export function readSession() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

export function saveSession(view) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ tab: view.tab, sort: view.sort, unread: view.unread }));
  } catch {
    // blocked storage: the view still works for this visit
  }
}

// The view to show. Each part comes from the address when it has a good value, else from the session, else the default. The category is read from
// ?category= (and from the older ?tab=, which the dashboard and bell links use for Needs action).
export function resolveView(params, stored = {}, isAdmin = false) {
  const fromUrl = validTab(params.get('category'), isAdmin) || validTab(params.get('tab'), isAdmin);
  const sortUrl = SORT_KEYS.includes(params.get('sort')) ? params.get('sort') : null;
  const unreadUrl = params.get('unread');
  return {
    tab: fromUrl || validTab(stored.tab, isAdmin) || DEFAULT_VIEW.tab,
    sort: sortUrl || (SORT_KEYS.includes(stored.sort) ? stored.sort : DEFAULT_VIEW.sort),
    unread: unreadUrl === '1' ? true : unreadUrl === '0' ? false : stored.unread === true,
  };
}

// The address for a view: only what differs from the default, so the plain page keeps a plain address.
export function viewToParams(view) {
  const params = {};
  if (view.tab !== DEFAULT_VIEW.tab) params.category = view.tab;
  if (view.sort !== DEFAULT_VIEW.sort) params.sort = view.sort;
  if (view.unread) params.unread = '1';
  return params;
}
