// Display helpers for shop closure dates (YYYY-MM-DD keys).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "October 20, 2026"
export function formatClosureDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// The warning shown to an admin about bookings already on a date that is being closed.
// `manyDates` is true when several dates were closed at once.
export function affectedBookingsNote(count, manyDates = false) {
  if (!count) return '';
  const noun = count === 1 ? 'booking is' : 'bookings are';
  const where = manyDates ? 'these dates. Closing them does' : 'this date. Closing it does';
  return `${count} Pending or Approved ${noun} already on ${where} not cancel or move them.`;
}

const nextDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

// Runs of consecutive closed days with the same reason become one group, so a week-long
// closure is one row instead of seven. [{ start, end, reason, days: [closure], affectedBookings }]
export function groupClosures(closures) {
  const groups = [];
  [...closures].sort((a, b) => a.date.localeCompare(b.date)).forEach((c) => {
    const last = groups[groups.length - 1];
    if (last && nextDay(last.end) === c.date && last.reason === c.reason) {
      last.end = c.date;
      last.days.push(c);
      last.affectedBookings += c.affectedBookings || 0;
    } else {
      groups.push({ start: c.date, end: c.date, reason: c.reason, days: [c], affectedBookings: c.affectedBookings || 0 });
    }
  });
  return groups;
}

// "October 11 - 16, 2026", "October 30 - November 2, 2026", or the plain date for one day.
export function formatClosureRange(start, end) {
  if (start === end) return formatClosureDate(start);
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  if (y1 !== y2) return `${formatClosureDate(start)} - ${formatClosureDate(end)}`;
  if (m1 !== m2) return `${MONTHS[m1 - 1]} ${d1} - ${MONTHS[m2 - 1]} ${d2}, ${y1}`;
  return `${MONTHS[m1 - 1]} ${d1} - ${d2}, ${y1}`;
}

export const MAX_RANGE_DAYS = 31;

// Every date key from `start` to `end` inclusive, worked out in UTC so the timezone never matters. Stops one past MAX_RANGE_DAYS so a
// caller can tell the range is too long without building a huge list.
export function dateRange(start, end) {
  const keys = [];
  const [y, m, d] = start.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  while (cursor.toISOString().slice(0, 10) <= end && keys.length <= MAX_RANGE_DAYS) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}
