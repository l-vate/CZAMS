// Extension days: when the lead asks for an extra day to finish a job and the admin approves it, that day (a date
// and a time block) is recorded on the booking and holds every technician on the job, exactly like the booking's
// own date and block (see findConflictingBooking in utils/assignments.js). The rules here are pure.
const { TIME_BLOCKS } = require('./timeBlocks');
const { isRealDateKey } = require('./closures');

const isSunday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay() === 0;

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Every date and block a booking occupies: its own, then each approved extra day.
function slotsOf(booking) {
  const slots = [];
  if (booking && booking.date && booking.time) slots.push({ date: booking.date, time: booking.time });
  ((booking && booking.extensionDays) || []).forEach((d) => {
    if (d && d.date && d.time) slots.push({ date: d.date, time: d.time });
  });
  return slots;
}

// The first working day after `fromKey`: not a Sunday and not one of `closedKeys`. Looks up to 30 days ahead.
function nextWorkingDayKey(fromKey, closedKeys = new Set()) {
  let key = fromKey;
  for (let i = 0; i < 30; i += 1) {
    key = addDays(key, 1);
    if (!isSunday(key) && !closedKeys.has(key)) return key;
  }
  return key;
}

// Why a requested extra day cannot be used, or null. `today` is a Manila date key. Closed shop dates are checked
// separately (they need the database).
function extensionSlotProblem({ date, time }, booking, today) {
  if (!isRealDateKey(date)) return 'Choose a valid date for the extra day.';
  if (!TIME_BLOCKS.includes(time)) return 'Choose Morning or Afternoon for the extra day.';
  // The block the job already has, or an extra day already approved, is named as such even on a Sunday.
  if (booking && date === booking.date && time === booking.time) return 'That is the time block this job already has. Choose another.';
  if (slotsOf(booking).some((s) => s.date === date && s.time === time)) return 'That extra day is already approved for this job.';
  const earliest = booking && booking.date && booking.date > today ? booking.date : today;
  if (date < earliest) return 'The extra day cannot be before the job or in the past.';
  if (isSunday(date)) return 'The shop is closed on Sundays. Choose another day.';
  return null;
}

module.exports = { slotsOf, nextWorkingDayKey, extensionSlotProblem, isSunday, addDays };
