// Which days the shop takes bookings, for the date pickers. The same rule as server/utils/businessDays.js (isBusinessDay): a day is closed
// when it is a Sunday and Sundays are closed, or when the admin closed it. The server is the one that enforces it; this only lets a page say
// so before the person goes on. Plain functions, no framework, so the tests load this file on its own.

// An OWNER DECISION, kept in one place on each side. HAND-SYNCED with SUNDAY_CLOSED in server/constants/scheduling.js: change both together
// (and the footer line "Sunday: Closed" in src/pages/public/landing_page.jsx).
export const SUNDAY_CLOSED = true;

export const SUNDAY_MESSAGE = 'The shop is closed on Sundays. Choose another day.';

// "YYYY-MM-DD" is a calendar date; the weekday of that date is the same whatever time zone the browser is in.
export const isSundayKey = (key) => /^\d{4}-\d{2}-\d{2}$/.test(String(key)) && new Date(`${key}T00:00:00Z`).getUTCDay() === 0;

// true when the shop is open on this date. `closedKeys` is a Set of the dates the admin closed.
export function isBusinessDay(key, closedKeys = new Set(), { sundayClosed = SUNDAY_CLOSED } = {}) {
  if (sundayClosed && isSundayKey(key)) return false;
  return !closedKeys.has(key);
}

// Why a picked date cannot be used because it is a Sunday, or null.
export const sundayProblem = (key, { sundayClosed = SUNDAY_CLOSED } = {}) => (sundayClosed && isSundayKey(key) ? SUNDAY_MESSAGE : null);
