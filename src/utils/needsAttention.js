// Plain helpers for the "Needs attention" panel and the sidebar badge (no framework, so the tests load this file on its own).

export const GROUP_TITLES = Object.freeze({
  today: 'Today',
  decision: 'Needs a decision',
  money: 'Money',
});
export const GROUP_KEYS = Object.freeze(['today', 'decision', 'money']);

// How the panel says how urgent an item is. The icon name is for the component; the text is always shown, so the urgency never relies on
// colour alone.
export const URGENCY_META = Object.freeze({
  today: { text: 'Due today', short: 'Today' },
  soon: { text: 'Soon', short: 'Soon' },
  waiting: { text: 'Waiting', short: 'Waiting' },
});

// The date key a number of days after another (plain Manila date keys, YYYY-MM-DD).
export function addDaysKey(key, n) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The number on the sidebar badge: the total of Today plus Needs a decision, capped at 99+. Nothing for zero.
export const BADGE_CAP = 99;
export function badgeText(total) {
  const n = Number(total) || 0;
  if (n <= 0) return '';
  return n > BADGE_CAP ? `${BADGE_CAP}+` : String(n);
}

// "Just now", "5 min", "3 h", "1 day", "4 days" for how long something has waited.
export function formatWaiting(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 2) return 'Just now';
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// "Nov 5" for a booked date key (a plain Manila date), or "No date".
export function formatBookedDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return 'No date';
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

// The sentence a screen reader hears when the counts change.
export function summaryText(data) {
  if (!data || !data.groups) return '';
  const parts = GROUP_KEYS.map((key) => `${GROUP_TITLES[key]}: ${data.groups[key]?.count ?? 0}`);
  return `Needs attention. ${parts.join(', ')}.`;
}

// true when every group is empty
export function isAllCaughtUp(data) {
  return Boolean(data && data.groups) && GROUP_KEYS.every((key) => (data.groups[key]?.count ?? 0) === 0);
}
