// Counts items per calendar month in Manila time, one bucket per month, zeros included. Pure: the month of an item comes from
// utils/manilaTime.js, so a browser in any time zone gets the same bars. Used by the charts on the dashboard, Analytics and
// Reports.
import { dayKeyOf, manilaTodayKey } from './manilaTime.js';

const monthOf = (key) => key.slice(0, 7);

function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  return `${year}-${String(total - year * 12 + 1).padStart(2, '0')}`;
}

// `fromKey` and `toKey` (YYYY-MM-DD) set the span; without them it is the last `months` months ending this month (Manila).
// Never more than a year of bars. `dateOf(item)` says which date puts an item in a month; `skip(item)` leaves items out.
export function countPerMonth(items, { fromKey, toKey, months = 6, dateOf, skip = () => false, now = new Date() } = {}) {
  const end = monthOf(toKey || manilaTodayKey(now));
  let start = fromKey ? monthOf(fromKey) : addMonths(end, -(months - 1));
  const earliest = addMonths(end, -11);
  if (start < earliest) start = earliest;

  const buckets = [];
  for (let key = start; key <= end; key = addMonths(key, 1)) {
    const [y, m] = key.split('-').map(Number);
    buckets.push({
      key,
      year: y,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      value: 0,
    });
  }

  items.forEach((item) => {
    const day = dayKeyOf(dateOf(item));
    if (skip(item) || !day) return;
    const bucket = buckets.find((b) => b.key === monthOf(day));
    if (bucket) bucket.value += 1;
  });

  const years = [...new Set(buckets.map((b) => b.year))];
  return {
    data: buckets.map(({ label, value }) => ({ label, value })),
    xLabel: years.length > 1 ? `Month (${years[0]} to ${years[years.length - 1]})` : `Month (${years[0]})`,
  };
}
