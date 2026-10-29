// The customer's report that the technicians did not come. Pure rules (taking `now` as a parameter) so the button, the waiting note and the
// server's own check all come from one place. A report is only a report: it never refunds anything, never changes the booking by itself and
// creates no rating or score for any technician. The admin decides (routes/bookingRoutes.js, PATCH /:bookingId/no-show/decision).
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { NO_SHOW_STATUS, NO_SHOW_REPORT_GRACE_MINUTES, NO_SHOW_REPORT_EXTRA_DAYS, NO_SHOW_NOTE_MAX, NO_SHOW_REASON_MIN, NO_SHOW_REASON_MAX } = require('../constants/bookingLifecycle');
const { blockStartInstant, manilaTodayKey } = require('./timeBlocks');
const { addDaysManila } = require('./manilaDate');

const REPORTABLE_STATUSES = [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];

// The first moment a no show can be reported: the block start plus the waiting grace.
function reportableFrom(booking, graceMinutes = NO_SHOW_REPORT_GRACE_MINUTES) {
  return new Date(blockStartInstant(booking.date, booking.time).getTime() + graceMinutes * 60000);
}

// "9:00 AM", the Manila clock time of an instant.
function clockText(instant) {
  const shifted = new Date(instant.getTime() + 8 * 3600000);
  const h = shifted.getUTCHours();
  const m = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

const reportExists = (booking) => Boolean(booking.noShow && booking.noShow.status && booking.noShow.status !== NO_SHOW_STATUS.NONE);

// { canReport, reason, waitUntil } for one booking at `now`. `reason` is one of: status, date, report, filed, wait, or null when allowed.
// `waitUntil` is the clock time to show ("You can report a no show from 9:00 AM on the service day") while the grace has not passed.
function noShowAvailability(booking, now = new Date(), { graceMinutes = NO_SHOW_REPORT_GRACE_MINUTES, extraDays = NO_SHOW_REPORT_EXTRA_DAYS } = {}) {
  if (!booking || !REPORTABLE_STATUSES.includes(booking.status) || booking.status === BOOKING_STATUS.COMPLETED) return { canReport: false, reason: 'status' };
  if (reportExists(booking)) return { canReport: false, reason: 'report' };
  if (booking.reportSubmitted) return { canReport: false, reason: 'filed' };
  const today = manilaTodayKey(now);
  if (!booking.date || today < booking.date || today > addDaysManila(booking.date, extraDays)) return { canReport: false, reason: 'date' };
  const from = reportableFrom(booking, graceMinutes);
  // after the service day the wait is over by definition: only the service day itself has a waiting grace
  if (today === booking.date && now < from) return { canReport: false, reason: 'wait', waitUntil: clockText(from) };
  return { canReport: true, reason: null };
}

// The note a customer may add: up to 300 characters, optional. { problem } or { note }.
function readNote(raw) {
  if (raw === undefined || raw === null || raw === '') return { note: '' };
  if (typeof raw !== 'string') return { problem: 'The note must be text.' };
  const note = raw.trim();
  if (note.length > NO_SHOW_NOTE_MAX) return { problem: `The note must be ${NO_SHOW_NOTE_MAX} characters or fewer.` };
  return { note };
}

// The reason an admin must give for any decision: 3 to 300 characters. { problem } or { reason }.
function readDecisionReason(raw) {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < NO_SHOW_REASON_MIN || reason.length > NO_SHOW_REASON_MAX) {
    return { problem: `Give a reason of ${NO_SHOW_REASON_MIN} to ${NO_SHOW_REASON_MAX} characters.` };
  }
  return { reason };
}

module.exports = { noShowAvailability, reportableFrom, clockText, readNote, readDecisionReason, reportExists, REPORTABLE_STATUSES };
