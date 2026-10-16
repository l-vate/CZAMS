// Calendar days in Philippine time (Asia/Manila, UTC+8, no daylight saving), whatever time zone the browser is in. The
// client mirror of server/utils/manilaDate.js. Every number the admin screens group or filter by day or month (monthly
// buckets, report ranges, the Statement of Account, the date pickers' earliest date) goes through here, so a browser in
// another time zone shows the same numbers. A "key" is YYYY-MM-DD. Plain functions only: no framework, no browser object.
const OFFSET_MS = 8 * 3600000;
const KEY = /^\d{4}-\d{2}-\d{2}$/;

// The Manila calendar day of an instant (a Date, an ISO string or a number).
export function manilaDateKey(instant) {
  return new Date(new Date(instant).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

// Today in Manila.
export function manilaTodayKey(now = new Date()) {
  return manilaDateKey(now);
}

// The Manila day of a stored date: a plain YYYY-MM-DD (a service date) is that day as it is; anything else is an instant.
export function dayKeyOf(value) {
  if (!value) return null;
  return KEY.test(value) ? value : manilaDateKey(value);
}

// A key moved by whole days.
export function addDaysToKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// The earliest date a booking may be made for: `days` days after today in Manila.
export function earliestBookingKey(days = 3, now = new Date()) {
  return addDaysToKey(manilaTodayKey(now), days);
}

// The two ends of a Manila day as real instants: 00:00:00.000 and 23:59:59.999 Manila time.
export function startOfManilaDay(key) {
  return new Date(`${key}T00:00:00.000+08:00`);
}
export function endOfManilaDay(key) {
  return new Date(`${key}T23:59:59.999+08:00`);
}

// A key written the way people read it: "Oct 14, 2026". A key is shown as that day whatever the browser's zone; an instant
// is shown as the Manila day it falls on.
export function formatManilaDay(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const key = dayKeyOf(value);
  if (!key) return 'N/A';
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}
