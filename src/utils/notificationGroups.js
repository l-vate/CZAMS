// Plain helpers for the notifications page: which day a notification belongs under, and the unread count of each category.
import { CATEGORY_ORDER, categoryOf } from '../constants/notificationCategories';

export const DATE_GROUPS = Object.freeze([
  { key: 'today', title: 'Today' },
  { key: 'yesterday', title: 'Yesterday' },
  { key: 'earlier', title: 'Earlier' },
]);

const dayNumber = (date) => Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000);

// 'today', 'yesterday' or 'earlier', by the viewer's own calendar day.
export function dateGroupOf(createdAt, now = new Date()) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 'earlier';
  const diff = Math.round(dayNumber(now) - dayNumber(created));
  if (diff <= 0) return 'today';
  return diff === 1 ? 'yesterday' : 'earlier';
}

// [{ key, title, items }] for the groups that have something: Today, Yesterday, Earlier, or the other way round for Oldest first (the oldest
// group is then on top). The order inside a group is the order of the list given, so the caller's sort is kept within each day group.
export function groupByDate(notifications, now = new Date(), sort = 'newest') {
  const groups = DATE_GROUPS
    .map(({ key, title }) => ({ key, title, items: notifications.filter((n) => dateGroupOf(n.createdAt, now) === key) }))
    .filter((group) => group.items.length > 0);
  return sort === 'oldest' ? groups.reverse() : groups;
}

// { all, byCategory: { bookings: { total, unread }, ... } } for the categories that have at least one notification, from rows of
// { type, total, unread } (what GET /api/notifications/counts answers, one row per kind).
export function countsFromTypes(rows) {
  const byCategory = {};
  const all = { total: 0, unread: 0 };
  for (const row of rows) {
    const key = categoryOf(row.type);
    byCategory[key] = byCategory[key] || { total: 0, unread: 0 };
    byCategory[key].total += row.total;
    byCategory[key].unread += row.unread;
    all.total += row.total;
    all.unread += row.unread;
  }
  return { all, byCategory };
}

// The same counts worked out from a list of notifications (used until the exact counts arrive, or when they cannot be loaded).
export function categoryCounts(notifications) {
  const rows = new Map();
  for (const n of notifications) {
    const row = rows.get(n.type) || { type: n.type, total: 0, unread: 0 };
    row.total += 1;
    if (!n.read) row.unread += 1;
    rows.set(n.type, row);
  }
  return countsFromTypes([...rows.values()]);
}

// The categories to show as tabs: those with a notification, in the tab order. The selected one stays even when it has none left.
export function visibleCategories(counts, selected) {
  return CATEGORY_ORDER.filter((key) => counts.byCategory[key] || key === selected);
}

export function inCategory(notifications, category) {
  return category === 'all' ? notifications : notifications.filter((n) => categoryOf(n.type) === category);
}

// The id of the admin's first tab (it lists open tasks, not notifications).
export const NEEDS_ACTION_TAB = 'needs-action';

export function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The list after "Mark all as read" on one tab: that category's notifications read, the others untouched ('all' marks every one).
export function markCategoryRead(notifications, category) {
  return notifications.map((n) => (category !== 'all' && categoryOf(n.type) !== category ? n : { ...n, read: true }));
}
