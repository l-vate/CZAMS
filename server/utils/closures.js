// Shop closure dates: the pure rules plus the lookup the booking routes share.
const { invalid } = require('./validation');
const { manilaTodayKey } = require('./timeBlocks');

const REASON_MIN = 3;
const REASON_MAX = 200;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A real calendar day written as YYYY-MM-DD (so 2026-02-31 is rejected).
function isRealDateKey(key) {
  if (typeof key !== 'string' || !DATE_KEY.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// "October 20, 2026"
function formatClosureDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// What an admin is allowed to add. Returns { problem, values }: problem is null or
// { status, message }; values are the trimmed fields to store. `today` is a Manila date key.
function readClosureInput({ date, reason }, today = manilaTodayKey()) {
  const { closureDateProblem } = require('./dateRules'); // required here: dateRules reads isRealDateKey from this file
  const dateProblem = closureDateProblem(date, today);
  if (dateProblem) return { problem: invalid(dateProblem) };
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < REASON_MIN || text.length > REASON_MAX) {
    return { problem: invalid(`Give a reason of ${REASON_MIN} to ${REASON_MAX} characters.`) };
  }
  return { problem: null, values: { date, reason: text } };
}

// The rejection used when a booking or a reschedule lands on a closed date.
function closedDateProblem(closure) {
  return invalid(`The shop is closed on ${formatClosureDate(closure.date)}: ${closure.reason}`);
}

// null when the shop is open on `date`, otherwise { status, message }. `Closure` is passed in so
// this file stays free of the model (and easy to test).
async function closureProblemFor(Closure, date) {
  if (!isRealDateKey(date)) return null;
  const closure = await Closure.findOne({ date }).lean();
  return closure ? closedDateProblem(closure) : null;
}

module.exports = {
  REASON_MIN, REASON_MAX, isRealDateKey, formatClosureDate, readClosureInput, closedDateProblem, closureProblemFor,
};
