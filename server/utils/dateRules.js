// The date rules of the whole app, in one place (constants/dateRules.json; the browser reads the same file through src/utils/dateRules.js).
// Every "today" is the Manila calendar day, and every function takes `now` so tests never depend on the real clock.
//
//   booking dates      customer and admin bookings, every reschedule, the no show reschedule: not in the past, at least MIN_LEAD_DAYS ahead
//                      (constants/scheduling.js), and no more than bookingMaxMonths calendar months after today.
//   past dates         things that already happened (report and filter ranges, history, purchase dates, claim dates): from earliestDate
//                      up to today, never in the future.
//   closed dates       admin closed dates: from today, no more than closureMaxMonths ahead.
//   technician leave   from today, no more than leaveMaxMonths ahead.
const rules = require('../constants/dateRules.json');
const scheduling = require('../constants/scheduling');
const { manilaToday, addDaysManila } = require('./manilaDate');
const { isRealDateKey } = require('./closures');

// `now` is a Date (the real or a fixed clock) or, where a caller already works with Manila day keys, that key itself.
const todayOf = (now) => (typeof now === 'string' ? now : manilaToday(now));

const EARLIEST_DATE = rules.earliestDate;
const BOOKING_MAX_MONTHS = rules.bookingMaxMonths;
const CLOSURE_MAX_MONTHS = rules.closureMaxMonths;
const LEAVE_MAX_MONTHS = rules.leaveMaxMonths;

// A date key `months` calendar months after `key`. A month with no such day (31 August plus one month) ends on its last day.
function addMonthsKey(key, months) {
  const [year, month, day] = key.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

// "Nov 9, 2026"
const show = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const months = (n) => `${n} month${n === 1 ? '' : 's'}`;

// { min, max } for a booking or a reschedule.
function bookingWindow(now = new Date()) {
  const today = todayOf(now);
  return { min: addDaysManila(today, scheduling.MIN_LEAD_DAYS), max: addMonthsKey(today, BOOKING_MAX_MONTHS) };
}

// null when `date` may be booked or rescheduled to, otherwise the sentence to show.
function bookingDateProblem(date, now = new Date()) {
  if (typeof date !== 'string' || !isRealDateKey(date)) return 'Choose a real date.';
  const today = todayOf(now);
  const { min, max } = bookingWindow(now);
  if (date < today) return `That date has already passed. Choose ${show(min)} or later.`;
  if (date < min) return `We need at least ${scheduling.MIN_LEAD_DAYS} days notice. The earliest date you can choose is ${show(min)}.`;
  if (date > max) return `We take bookings up to ${months(BOOKING_MAX_MONTHS)} ahead. The latest date you can choose is ${show(max)}.`;
  return null;
}

// { min, max } for something that already happened.
function pastWindow(now = new Date()) {
  return { min: EARLIEST_DATE, max: manilaToday(now) };
}

// null when `date` is a real day from earliestDate up to today, otherwise the sentence to show. `what` names the date ("start date").
function pastDateProblem(date, now = new Date(), what = 'date') {
  if (typeof date !== 'string' || !isRealDateKey(date)) return `Choose a real ${what}.`;
  const { min, max } = pastWindow(now);
  if (date < min) return `The ${what} cannot be before ${show(min)}.`;
  if (date > max) return `The ${what} cannot be in the future. The latest is today, ${show(max)}.`;
  return null;
}

// { min, max } for an admin closed date.
function closureWindow(now = new Date()) {
  const today = todayOf(now);
  return { min: today, max: addMonthsKey(today, CLOSURE_MAX_MONTHS) };
}

function closureDateProblem(date, now = new Date()) {
  if (typeof date !== 'string' || !isRealDateKey(date)) return 'Choose a valid date (YYYY-MM-DD).';
  const { min, max } = closureWindow(now);
  if (date < min) return 'A closure cannot be on a date that has already passed.';
  if (date > max) return `A closure can be set up to ${months(CLOSURE_MAX_MONTHS)} ahead. The latest date is ${show(max)}.`;
  return null;
}

// { min, max } for a technician's day off.
function leaveWindow(now = new Date()) {
  const today = todayOf(now);
  return { min: today, max: addMonthsKey(today, LEAVE_MAX_MONTHS) };
}

function leaveDateProblem(date, now = new Date()) {
  if (typeof date !== 'string' || !isRealDateKey(date)) return 'Choose a valid date (YYYY-MM-DD).';
  const { min, max } = leaveWindow(now);
  if (date < min) return 'A day off cannot be on a date that has already passed.';
  if (date > max) return `A day off can be set up to ${months(LEAVE_MAX_MONTHS)} ahead. The latest date is ${show(max)}.`;
  return null;
}

module.exports = {
  EARLIEST_DATE, BOOKING_MAX_MONTHS, CLOSURE_MAX_MONTHS, LEAVE_MAX_MONTHS,
  addMonthsKey, bookingWindow, bookingDateProblem, pastWindow, pastDateProblem, closureWindow, closureDateProblem, leaveWindow, leaveDateProblem,
};
