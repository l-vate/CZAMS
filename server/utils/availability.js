// Which dates a visitor can still book, for the public landing page calendar. Only the
// answer is public (Morning and Afternoon open or not); no technician or team is named.
//
// A block counts as open when at least one pair of field technicians is still free in it: the free technicians
// (utils/technicians.js) paired up, after taking away those already on a booking in that block (its own date and any
// approved extra day) AND the Pending requests nobody has been assigned to yet (those are first in line for the free
// pairs). The old Team records are not used at all. The lead-time and Sunday rules match booking creation.
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Closure = require('../models/Closure');
const TechnicianOff = require('../models/TechnicianOff');
const { offIdsAt, offRowsBetween } = require('./technicianOff');
const { activeStatuses, getMemberIds } = require('./assignments');
const { slotsOf } = require('./extensionDays');
const { listFieldTechnicians } = require('./technicians');
const { TIME_BLOCKS, manilaTodayKey } = require('./timeBlocks');

// Same rule as isDateAllowed in routes/bookingRoutes.js: both read MIN_LEAD_DAYS from constants/scheduling.js.
const { MIN_LEAD_DAYS } = require('../constants/scheduling');
const MAX_RANGE_DAYS = 62;

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

const { isSunday, sundaysAreClosed } = require('./businessDays');

const KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Why a block is or is not open, for the customer calendars and the booking checks. `reason` is null when a pair of field technicians is
// still free, otherwise:
//   'noTechnicians'  nobody can work in that block: every technician is marked as not available (leave, a day off), or only one is left
//                    and nobody has booked them, so no pair can be formed
//   'fullyBooked'    technicians can work but every crew is already taken (some of them may be on leave, the rest are booked)
// Only these two codes ever leave the server: who is off, and why, never does (see getAvailability).
const BLOCK_REASON = Object.freeze({ NO_TECHNICIANS: 'noTechnicians', FULLY_BOOKED: 'fullyBooked' });

// `technicians` are the active field technicians, `bookings` the ones that hold a slot (activeStatuses(): Pending counts, first come first
// served), `offIds` the technicians the admin marked as not available in that date and block (utils/technicianOff.js). A Pending request
// nobody has been assigned to yet counts as waiting for a pair, so it uses one up before the proposal is even made.
function blockState({ technicians, bookings, date, time, offIds = new Set() }) {
  const sameBlock = bookings.filter((b) => slotsOf(b).some((s) => s.date === date && s.time === time));
  const booked = new Set(sameBlock.flatMap(getMemberIds));
  const busy = new Set([...booked, ...offIds]); // technicians off that day are as unavailable as busy ones
  const waiting = sameBlock.filter((b) => b.status === BOOKING_STATUS.PENDING && getMemberIds(b).length === 0).length;
  const freeUnits = Math.floor(technicians.filter((t) => !busy.has(t._id)).length / 2);
  if (freeUnits - waiting > 0) return { open: true, reason: null };
  const working = technicians.filter((t) => !offIds.has(t._id));
  if (working.length === 0) return { open: false, reason: BLOCK_REASON.NO_TECHNICIANS };
  const takenByBookings = waiting > 0 || working.some((t) => booked.has(t._id));
  return { open: false, reason: takenByBookings ? BLOCK_REASON.FULLY_BOOKED : BLOCK_REASON.NO_TECHNICIANS };
}

// Whether one date and time block still has a free pair of field technicians. Booking creation, the customer reschedule and the public
// calendar all ask this one rule.
function blockIsOpen(args) {
  return blockState(args).open;
}

// The same answer for a single slot, read from the database: { open, reason }. `excludeBookingId` leaves one booking out (the one being moved).
async function slotState(date, time, excludeBookingId) {
  const [technicians, bookings, offRows] = await Promise.all([
    listFieldTechnicians(User, '_id'),
    Booking.find({
      status: { $in: activeStatuses() },
      $or: [{ date }, { extensionDays: { $elemMatch: { date } } }],
      ...(excludeBookingId ? { bookingId: { $ne: excludeBookingId } } : {}),
    }).select('date time status technician assignments extensionDays'),
    offRowsBetween(TechnicianOff, date, date),
  ]);
  return blockState({ technicians, bookings, date, time, offIds: offIdsAt(offRows, date, time) });
}

async function isSlotOpen(date, time, excludeBookingId) {
  return (await slotState(date, time, excludeBookingId)).open;
}

// The words a closed day carries for the calendars: "Closed: <reason>" for a closure the admin added (a closure has a reason and no
// separate type), "Closed: Sunday" for a Sunday. Never empty.
const closedLabel = (reason) => `Closed: ${String(reason || '').trim() || 'Shop closed'}`;

// Returns [{ date, status, morning, afternoon, ... }] for every day from `from` to `to` (inclusive).
// status: 'open' | 'limited' (one block open) | 'full' | 'closed' (Sunday) | 'shop-closed' (a closure
// the admin added, with its `reason`) | 'too-soon' | 'past'
// Why a day or block cannot be booked (added next to the fields above, which keep their meaning):
//   closed days    reasonCode 'closed' and closedLabel ("Closed: Holiday", "Closed: Sunday")
//   open, limited and full days    morningReason and afternoonReason: null, 'noTechnicians' or 'fullyBooked'; on a full day reasonCode is
//                  'noTechnicians' when no block has technicians to book, otherwise 'fullyBooked'
// PRIVACY: this answer is public. It carries the two codes only, never which technician is on leave, their names or ids, or their reason.
async function getAvailability(from, to) {
  const today = manilaTodayKey();
  const firstBookable = addDays(today, MIN_LEAD_DAYS);

  const [technicians, bookings, closures, offRows] = await Promise.all([
    listFieldTechnicians(User, '_id'),
    Booking.find({ status: { $in: activeStatuses() }, $or: [{ date: { $gte: from, $lte: to } }, { 'extensionDays.date': { $gte: from, $lte: to } }] })
      .select('date time status technician assignments extensionDays'),
    Closure.find({ date: { $gte: from, $lte: to } }).select('date reason').lean(),
    offRowsBetween(TechnicianOff, from, to),
  ]);
  const closureReason = new Map(closures.map((c) => [c.date, c.reason]));

  const days = [];
  for (let key = from; key <= to; key = addDays(key, 1)) {
    if (key < today) { days.push({ date: key, status: 'past' }); continue; }
    if (closureReason.has(key)) {
      days.push({ date: key, status: 'shop-closed', reason: closureReason.get(key), reasonCode: 'closed', closedLabel: closedLabel(closureReason.get(key)) });
      continue;
    }
    if (sundaysAreClosed() && isSunday(key)) { days.push({ date: key, status: 'closed', reasonCode: 'closed', closedLabel: closedLabel('Sunday') }); continue; }
    if (key < firstBookable) { days.push({ date: key, status: 'too-soon' }); continue; }

    const state = {};
    TIME_BLOCKS.forEach((block) => {
      state[block] = blockState({ technicians, bookings, date: key, time: block, offIds: offIdsAt(offRows, key, block) });
    });

    const openCount = Object.values(state).filter((x) => x.open).length;
    const day = {
      date: key,
      status: openCount === TIME_BLOCKS.length ? 'open' : openCount > 0 ? 'limited' : 'full',
      morning: state.Morning.open,
      afternoon: state.Afternoon.open,
      morningReason: state.Morning.reason,
      afternoonReason: state.Afternoon.reason,
    };
    if (day.status === 'full') {
      day.reasonCode = Object.values(state).every((x) => x.reason === BLOCK_REASON.NO_TECHNICIANS) ? BLOCK_REASON.NO_TECHNICIANS : BLOCK_REASON.FULLY_BOOKED;
    }
    days.push(day);
  }
  return days;
}

module.exports = { getAvailability, isSlotOpen, slotState, blockIsOpen, blockState, BLOCK_REASON, MIN_LEAD_DAYS, MAX_RANGE_DAYS, KEY_PATTERN, addDays };
