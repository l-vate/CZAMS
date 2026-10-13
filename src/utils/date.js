// Local YYYY-MM-DD for a Date. Never use date.toISOString().split('T')[0] for this: that
// converts to UTC first, which shifts a local-midnight date back a day for anyone ahead of
// UTC (e.g. Philippines, UTC+8) — a date computed between midnight and 8am local time lands
// on the wrong day. Mirrors calendar_view.jsx's toKey.
export function toLocalDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
