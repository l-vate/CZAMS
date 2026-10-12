// Which dates a visitor can still book, for the public landing page calendar. Only the
// answer is public (Morning and Afternoon open or not); no technician or team is named.
//
// A block counts as open when at least one team is still free in it, after taking away the
// teams already assigned AND the Pending requests nobody has been assigned to yet (those are
// first in line for the free teams). With no teams set up yet, free technicians are paired up
// instead. The lead-time and Sunday rules match booking creation.
const { ROLE } = require('../constants/roles');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const Team = require('../models/Team');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Closure = require('../models/Closure');
const { activeStatuses, getMemberIds } = require('./assignments');
const { slotsOf } = require('./extensionDays');
const { TIME_BLOCKS, manilaTodayKey } = require('./timeBlocks');

// Same rule as isDateAllowed in routes/bookingRoutes.js: a booking must be at least this many days ahead.
const MIN_LEAD_DAYS = 3;
const MAX_RANGE_DAYS = 62;

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

const isSunday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay() === 0;

const KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Returns [{ date, status, morning, afternoon }] for every day from `from` to `to` (inclusive).
// status: 'open' | 'limited' (one block open) | 'full' | 'closed' (Sunday) | 'shop-closed' (a closure
// the admin added, with its `reason`) | 'too-soon' | 'past'
async function getAvailability(from, to) {
  const today = manilaTodayKey();
  const firstBookable = addDays(today, MIN_LEAD_DAYS);

  const [teams, technicians, bookings, closures] = await Promise.all([
    Team.find({ isActive: true }).select('lead helper'),
    User.find({ role: ROLE.STAFF, isActive: true }).select('_id'),
    Booking.find({ status: { $in: activeStatuses() }, $or: [{ date: { $gte: from, $lte: to } }, { 'extensionDays.date': { $gte: from, $lte: to } }] })
      .select('date time status technician assignments extensionDays'),
    Closure.find({ date: { $gte: from, $lte: to } }).select('date reason').lean(),
  ]);
  const closureReason = new Map(closures.map((c) => [c.date, c.reason]));

  const activeIds = new Set(technicians.map((t) => t._id));
  const usableTeams = teams.filter((t) => activeIds.has(t.lead) && activeIds.has(t.helper));

  const days = [];
  for (let key = from; key <= to; key = addDays(key, 1)) {
    if (key < today) { days.push({ date: key, status: 'past' }); continue; }
    if (closureReason.has(key)) { days.push({ date: key, status: 'shop-closed', reason: closureReason.get(key) }); continue; }
    if (isSunday(key)) { days.push({ date: key, status: 'closed' }); continue; }
    if (key < firstBookable) { days.push({ date: key, status: 'too-soon' }); continue; }

    const open = {};
    TIME_BLOCKS.forEach((block) => {
      const sameBlock = bookings.filter((b) => slotsOf(b).some((s) => s.date === key && s.time === block));
      const busy = new Set(sameBlock.flatMap(getMemberIds));
      const waiting = sameBlock.filter((b) => b.status === BOOKING_STATUS.PENDING && getMemberIds(b).length === 0).length;
      const freeUnits = usableTeams.length > 0
        ? usableTeams.filter((t) => !busy.has(t.lead) && !busy.has(t.helper)).length
        : Math.floor(technicians.filter((t) => !busy.has(t._id)).length / 2);
      open[block] = freeUnits - waiting > 0;
    });

    const openCount = Object.values(open).filter(Boolean).length;
    days.push({
      date: key,
      status: openCount === TIME_BLOCKS.length ? 'open' : openCount > 0 ? 'limited' : 'full',
      morning: open.Morning,
      afternoon: open.Afternoon,
    });
  }
  return days;
}

module.exports = { getAvailability, MIN_LEAD_DAYS, MAX_RANGE_DAYS, KEY_PATTERN, addDays };
