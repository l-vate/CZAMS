// Working-day helpers for the extension form. They mirror server/utils/extensionDays.js: the shop is closed on
// Sundays and on the dates the admin closes, and every date is a plain "YYYY-MM-DD" key worked out in UTC so the
// browser's time zone never moves a day.
export const isSundayKey = (key) => new Date(`${key}T00:00:00Z`).getUTCDay() === 0;

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Today's date in Philippine time (UTC+8, no daylight saving), the same day the server uses.
export const manilaTodayKey = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);

// The first working day after `fromKey`: not a Sunday and not one of the closed dates.
export function nextWorkingDayKey(fromKey, closedKeys = new Set()) {
  let key = fromKey;
  for (let i = 0; i < 30; i += 1) {
    key = addDaysKey(key, 1);
    if (!isSundayKey(key) && !closedKeys.has(key)) return key;
  }
  return key;
}

// The extra day offered by default for a job: the next working day after the job's date, or after today if the
// job's date has already passed.
export function defaultExtensionDate(jobDate, closedKeys = new Set(), today = manilaTodayKey()) {
  const base = jobDate && jobDate > today ? jobDate : today;
  return nextWorkingDayKey(base, closedKeys);
}
