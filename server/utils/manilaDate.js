// Calendar dates in Philippine time (Asia/Manila, UTC+8, no daylight saving), whatever time zone the server runs in.
// Every booking rule that talks about "today", "three days ahead" or "three months ago" goes through here, so a server
// in UTC, in Manila or anywhere else gives the same answer, including between midnight and 08:00 in Manila, when the
// server's own date is still yesterday. Dates are "YYYY-MM-DD" keys; instants are real Dates.
const { manilaTodayKey } = require('./timeBlocks');
const { addDays } = require('./extensionDays');
const { isRealDateKey } = require('./closures');

const MANILA_OFFSET_MS = 8 * 3600000;

// Today's date in Manila.
const manilaToday = (now = new Date()) => manilaTodayKey(now);

// The Manila date of an instant.
const manilaDateKey = (date) => manilaTodayKey(new Date(date));

// A date key moved by whole days.
const addDaysManila = (key, days) => addDays(key, days);

// The date key `months` calendar months before Manila today. A month that has no such day (31 May minus one month) ends on its last day.
function monthsAgoManilaKey(months, now = new Date()) {
  const [year, month, day] = manilaToday(now).split('-').map(Number);
  const total = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

// The instant that starts that day in Manila (00:00 Manila).
function monthsAgoManila(months, now = new Date()) {
  const [year, month, day] = monthsAgoManilaKey(months, now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS);
}

// True when `dateKey` is a real date at least `days` days after Manila today.
function isAtLeastDaysAhead(dateKey, days, now = new Date()) {
  return isRealDateKey(dateKey) && dateKey >= addDaysManila(manilaToday(now), days);
}

module.exports = { manilaToday, manilaDateKey, addDaysManila, monthsAgoManila, monthsAgoManilaKey, isAtLeastDaysAhead };
