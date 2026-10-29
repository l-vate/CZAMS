// Wording and list shaping for the two collapsible panels on the admin Calendar page (technician leave and closed dates). Plain functions
// only, so the counts and the short lists can be tested without a browser. A day is a YYYY-MM-DD Manila key; `today` is passed in.

export const SHORT_LIST = 5;

// "leave" and "Leave" read the same: the first letter is capitalized, the rest is left as the admin typed it.
export function capitalizeReason(text) {
  const s = String(text || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Splits entries (each with a `date`, or a closure group with an `end`) into today-and-later and earlier ones.
export function splitUpcoming(items, today, key = 'date') {
  const upcoming = [];
  const past = [];
  items.forEach((item) => (item[key] >= today ? upcoming : past).push(item));
  return { upcoming, past };
}

// [[date, [entry]]] sorted by date, one heading per date even when several technicians are off that day.
export function groupByDate(entries) {
  const groups = new Map();
  entries.forEach((e) => {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// The first few entries of date groups: whole dates are kept together, and the cut falls after the date that reaches `limit` entries.
export function limitGroups(groups, limit = SHORT_LIST) {
  const shown = [];
  let count = 0;
  for (const group of groups) {
    if (count >= limit) break;
    shown.push(group);
    count += group[1].length;
  }
  return shown;
}

export const leaveSummary = (upcomingCount) => (upcomingCount > 0 ? `Technician leave, ${upcomingCount} upcoming` : 'Technician leave, none upcoming');

// "Closed dates, 1 range (3 days)" from closure groups (see groupClosures).
export function closureSummary(groups) {
  if (groups.length === 0) return 'Closed dates, none upcoming';
  const days = groups.reduce((sum, g) => sum + g.days.length, 0);
  return `Closed dates, ${groups.length} ${groups.length === 1 ? 'range' : 'ranges'} (${days} ${days === 1 ? 'day' : 'days'})`;
}

// The open or closed state of a panel is kept for the browser session; storage that is blocked just means the default.
export function readPanelOpen(key) {
  try {
    const v = window.sessionStorage.getItem(`czams-panel-${key}`);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}
export function writePanelOpen(key, open) {
  try {
    window.sessionStorage.setItem(`czams-panel-${key}`, open ? '1' : '0');
  } catch {
    // not remembered
  }
}
