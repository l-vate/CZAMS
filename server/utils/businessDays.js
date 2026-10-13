// Which days the shop takes bookings: the ONE rule behind "is this a business day". A day is closed when the admin
// closed it (a closure date) or when it is a Sunday and constants/scheduling.js says Sundays are closed
// (SUNDAY_CLOSED, an owner decision). The weekday is the calendar weekday of the date key, which is the Manila weekday
// because bookings store plain Manila dates. Used by booking create, customer reschedule, reschedule approval, the
// disruption reschedule, extension days, the back job visit date, the public availability calendar and auto-assign's
// suggested dates.
const scheduling = require('../constants/scheduling');
const { invalid } = require('./validation');
const { isRealDateKey, closureProblemFor } = require('./closures');

const isSunday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay() === 0;

// Read at the moment of the call, so flipping SUNDAY_CLOSED (or a test setting it) takes effect everywhere at once.
const sundaysAreClosed = () => scheduling.SUNDAY_CLOSED !== false;

const SUNDAY_MESSAGE = 'The shop is closed on Sundays. Choose another day.';

// True when the shop is open on this date. `closedKeys` is a Set of the admin's closure date keys.
function isBusinessDay(key, closedKeys = new Set()) {
  if (!isRealDateKey(key)) return false;
  if (sundaysAreClosed() && isSunday(key)) return false;
  return !closedKeys.has(key);
}

// The first business day after `fromKey` (or `fromKey` itself when `inclusive`). Looks up to 60 days ahead.
function nextBusinessDay(fromKey, closedKeys = new Set(), { inclusive = false } = {}) {
  const [y, m, d] = fromKey.split('-').map(Number);
  const step = (n) => new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  for (let i = inclusive ? 0 : 1; i <= 60; i += 1) {
    const key = step(i);
    if (isBusinessDay(key, closedKeys)) return key;
  }
  return step(inclusive ? 0 : 1);
}

// null when bookings are taken on this date, otherwise { status, message }: a Sunday (when Sundays are closed) or a
// closure date. `Closure` is the Mongoose model, passed in.
async function businessDayProblem(Closure, key) {
  if (isRealDateKey(key) && sundaysAreClosed() && isSunday(key)) return invalid(SUNDAY_MESSAGE);
  return closureProblemFor(Closure, key);
}

module.exports = { isSunday, sundaysAreClosed, isBusinessDay, nextBusinessDay, businessDayProblem, SUNDAY_MESSAGE };
