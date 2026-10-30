// The date rules of the app, the browser's copy of server/utils/dateRules.js (the same constants file, server/constants/dateRules.json).
// The date pickers take their min and max from here and the forms show the same sentences the server sends. Every "today" is the Manila
// day, and every function takes `now` so tests never depend on the real clock. Plain functions: no framework, no browser object.
import rules from '../../server/constants/dateRules.json';
import { manilaTodayKey, addDaysToKey } from './manilaTime';

export const EARLIEST_DATE = rules.earliestDate;
export const BOOKING_MAX_MONTHS = rules.bookingMaxMonths;
export const CLOSURE_MAX_MONTHS = rules.closureMaxMonths;
export const LEAVE_MAX_MONTHS = rules.leaveMaxMonths;
// the booking lead time, as server/constants/scheduling.js MIN_LEAD_DAYS (a test keeps the two equal)
export const BOOKING_LEAD_DAYS = 3;

const KEY = /^\d{4}-\d{2}-\d{2}$/;
export function isRealKey(key) {
  if (typeof key !== 'string' || !KEY.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const todayOf = (now) => (typeof now === 'string' ? now : manilaTodayKey(now));

// A date key `months` calendar months after `key`. A month with no such day (31 August plus one month) ends on its last day.
export function addMonthsKey(key, months) {
  const [year, month, day] = key.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

const show = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const months = (n) => `${n} month${n === 1 ? '' : 's'}`;

// { min, max } of a booking or reschedule date picker
export function bookingWindow(now = new Date()) {
  const today = todayOf(now);
  return { min: addDaysToKey(today, BOOKING_LEAD_DAYS), max: addMonthsKey(today, BOOKING_MAX_MONTHS) };
}

export function bookingDateProblem(date, now = new Date()) {
  if (typeof date !== 'string' || !isRealKey(date)) return 'Choose a real date.';
  const today = todayOf(now);
  const { min, max } = bookingWindow(now);
  if (date < today) return `That date has already passed. Choose ${show(min)} or later.`;
  if (date < min) return `We need at least ${BOOKING_LEAD_DAYS} days notice. The earliest date you can choose is ${show(min)}.`;
  if (date > max) return `We take bookings up to ${months(BOOKING_MAX_MONTHS)} ahead. The latest date you can choose is ${show(max)}.`;
  return null;
}

// { min, max } for something that already happened (report ranges, filters, history)
export function pastWindow(now = new Date()) {
  return { min: EARLIEST_DATE, max: todayOf(now) };
}

export function pastDateProblem(date, now = new Date(), what = 'date') {
  if (typeof date !== 'string' || !isRealKey(date)) return `Choose a real ${what}.`;
  const { min, max } = pastWindow(now);
  if (date < min) return `The ${what} cannot be before ${show(min)}.`;
  if (date > max) return `The ${what} cannot be in the future. The latest is today, ${show(max)}.`;
  return null;
}

// A range of two past dates: either problem, or an end before the start, or null.
export function pastRangeProblem(fromKey, toKey, now = new Date()) {
  if (fromKey) { const p = pastDateProblem(fromKey, now, 'start date'); if (p) return p; }
  if (toKey) { const p = pastDateProblem(toKey, now, 'end date'); if (p) return p; }
  if (fromKey && toKey && toKey < fromKey) return 'The end date cannot be before the start date.';
  return null;
}

export function closureWindow(now = new Date()) {
  const today = todayOf(now);
  return { min: today, max: addMonthsKey(today, CLOSURE_MAX_MONTHS) };
}

export function closureDateProblem(date, now = new Date()) {
  if (typeof date !== 'string' || !isRealKey(date)) return 'Choose a valid date (YYYY-MM-DD).';
  const { min, max } = closureWindow(now);
  if (date < min) return 'A closure cannot be on a date that has already passed.';
  if (date > max) return `A closure can be set up to ${months(CLOSURE_MAX_MONTHS)} ahead. The latest date is ${show(max)}.`;
  return null;
}

export function leaveWindow(now = new Date()) {
  const today = todayOf(now);
  return { min: today, max: addMonthsKey(today, LEAVE_MAX_MONTHS) };
}

export function leaveDateProblem(date, now = new Date()) {
  if (typeof date !== 'string' || !isRealKey(date)) return 'Choose a valid date (YYYY-MM-DD).';
  const { min, max } = leaveWindow(now);
  if (date < min) return 'A day off cannot be on a date that has already passed.';
  if (date > max) return `A day off can be set up to ${months(LEAVE_MAX_MONTHS)} ahead. The latest date is ${show(max)}.`;
  return null;
}
