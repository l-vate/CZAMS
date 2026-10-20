// Auto-assign: choose who should do a booking. The choosing itself (pickAssignment and
// findNextFreeDates) is pure: it takes plain data and returns an answer, so it can be
// tested without a database. proposeAssignment gathers the data and calls them.
//
// Rules, in order:
//  1. Only active technicians who are free in the booking's date and time block are candidates.
//     A service that needs two gets a lead and a helper.
//  2. If the customer asked for a technician and they are a candidate, they are the lead.
//  3. Otherwise the lead is the candidate with the fewest bookings in the booking's Monday to
//     Sunday week. Ties: fewest upcoming bookings overall, then the name (A to Z). The helper
//     is the next one by the same order.
//  4. Nobody free: say so, and suggest up to 3 later dates where someone is.
const User = require('../models/User');
const Booking = require('../models/Booking');
const Closure = require('../models/Closure');
const { activeStatuses, getMemberIds, getMinTechnicians } = require('./assignments');
const { manilaTodayKey } = require('./timeBlocks');
const { listFieldTechnicians } = require('./technicians');
const { slotsOf } = require('./extensionDays');

// ---------- date keys ("YYYY-MM-DD"), worked out in UTC so the server's timezone never matters
function toUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(key, n) {
  const d = toUtc(key);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

// Monday and Sunday of the week containing the date.
function weekRange(key) {
  const day = toUtc(key).getUTCDay(); // 0 = Sunday
  const sinceMonday = (day + 6) % 7;
  const monday = addDays(key, -sinceMonday);
  return { start: monday, end: addDays(monday, 6) };
}

const { isBusinessDay } = require('./businessDays');

// ---------- pure selection

// How many of the given bookings (each a list of technician ids) involve any of these people.
function countLoad(memberIds, bookingMemberLists) {
  const wanted = new Set(memberIds);
  return bookingMemberLists.filter((list) => list.some((id) => wanted.has(id))).length;
}

function rank(candidate, weekBookings, upcomingBookings) {
  return {
    ...candidate,
    weekLoad: countLoad(candidate.memberIds, weekBookings),
    upcomingLoad: countLoad(candidate.memberIds, upcomingBookings),
  };
}

const byLoadThenName = (a, b) =>
  a.weekLoad - b.weekLoad || a.upcomingLoad - b.upcomingLoad || a.name.localeCompare(b.name);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * @param {object} input
 * @param {number} input.minTechnicians  1 (a single technician will do) or 2 (two technicians)
 * @param {{_id,name}[]} input.technicians                active technicians
 * @param {Iterable<string>} input.busyIds                technicians busy in this date and block
 * @param {string} [input.requestedTechnicianId]
 * @param {string[][]} input.weekBookings                 member ids of each booking that week
 * @param {string[][]} input.upcomingBookings             member ids of each upcoming booking
 * @returns {{ assignment: null | {technicianId, helperId?}, reason: string }}
 */
function pickAssignment({
  minTechnicians, technicians, busyIds, requestedTechnicianId,
  weekBookings = [], upcomingBookings = [],
}) {
  const busy = new Set(busyIds);
  const requestedName = technicians.find((t) => t._id === requestedTechnicianId)?.name;
  const needed = minTechnicians <= 1 ? 1 : 2;

  const candidates = technicians
    .filter((t) => !busy.has(t._id))
    .map((t) => rank({ id: t._id, name: t.name, memberIds: [t._id] }, weekBookings, upcomingBookings))
    .sort(byLoadThenName);

  if (candidates.length < needed) {
    return {
      assignment: null,
      reason: needed === 1
        ? 'No technician is free for this date and time block.'
        : 'Two technicians are not free for this date and time block.',
    };
  }

  // 2. the customer's requested technician leads, if free
  const preferred = requestedTechnicianId ? candidates.find((c) => c.id === requestedTechnicianId) : null;
  const lead = preferred || candidates[0];
  const helper = needed === 2 ? candidates.find((c) => c.id !== lead.id) : null;
  const assignment = helper ? { technicianId: lead.id, helperId: helper.id } : { technicianId: lead.id };
  const withHelper = helper ? ` together with ${helper.name}` : '';

  if (preferred) {
    return { assignment, reason: `${preferred.name}, the technician the customer asked for, is free, so they were chosen${withHelper}.` };
  }

  // 3. lightest week, then fewest upcoming, then name
  const tiedOnWeek = candidates.filter((c) => c.weekLoad === lead.weekLoad);
  const tiedOnBoth = tiedOnWeek.filter((c) => c.upcomingLoad === lead.upcomingLoad);

  let reason = `${lead.name} has the fewest bookings that week (${plural(lead.weekLoad, 'booking')})${withHelper ? `${withHelper}` : ''}.`;
  if (requestedTechnicianId) {
    reason = `${requestedName || 'The technician the customer asked for'} is busy then. ${reason}`;
  }
  if (tiedOnWeek.length > 1) {
    reason += tiedOnBoth.length > 1
      ? ` ${plural(tiedOnBoth.length, 'candidate')} tied on both that week and upcoming bookings, so the name (A to Z) decided.`
      : ` ${plural(tiedOnWeek.length, 'candidate')} tied for the week; ${lead.name} has the fewest upcoming bookings (${lead.upcomingLoad}).`;
  }

  return { assignment, reason };
}

/**
 * Up to `limit` later dates (Sundays and the admin's closure dates skipped, the shop is closed)
 * on which someone is free in the same time block. busyByDate maps a date key to the set of busy
 * technician ids; closedDates is a Set of closure date keys.
 */
function findNextFreeDates({
  minTechnicians, technicians, afterDateKey, busyByDate, closedDates = new Set(), limit = 3, searchDays = 60,
}) {
  const found = [];
  for (let i = 1; i <= searchDays && found.length < limit; i += 1) {
    const key = addDays(afterDateKey, i);
    if (!isBusinessDay(key, closedDates)) continue;
    const busy = busyByDate.get(key) || new Set();
    const someoneFree = technicians.filter((t) => !busy.has(t._id)).length >= (minTechnicians <= 1 ? 1 : 2);
    if (someoneFree) found.push(key);
  }
  return found;
}

// ---------- the database side

// Everything the choosing needs about one booking's date: who exists, who is busy when, and which dates are closed.
// `booking` must have its service populated.
async function loadContext(booking) {
  const minTechnicians = getMinTechnicians(booking.service);
  const members = await listFieldTechnicians(User, 'name');

  const technicians = members.map((u) => ({ _id: u._id, name: u.name }));

  // Everything on the books in the surrounding weeks and from today on, excluding this booking.
  const { start, end } = weekRange(booking.date);
  const today = manilaTodayKey();
  const horizon = addDays(booking.date, 61);
  const nearby = await Booking.find({
    status: { $in: activeStatuses() },
    bookingId: { $ne: booking.bookingId },
    $or: [{ date: { $gte: start < today ? start : today, $lte: horizon } }, { 'extensionDays.date': { $gte: start < today ? start : today, $lte: horizon } }],
  }).select('date time technician assignments extensionDays');

  const memberLists = (docs) => docs.map((b) => getMemberIds(b));
  const weekBookings = memberLists(nearby.filter((b) => b.date >= start && b.date <= end));
  const upcomingBookings = memberLists(nearby.filter((b) => b.date >= today));

  const busyByDate = busyByDateOf(nearby, booking.time);
  const closedDates = new Set((await Closure.find({ date: { $gte: today, $lte: horizon } }).select('date').lean()).map((c) => c.date));
  return { minTechnicians, technicians, weekBookings, upcomingBookings, busyByDate, closedDates };
}

// A booking holds its technicians on its own date and block and on each approved extra day. Maps a date key to the set of
// technician ids busy in `time` that day.
function busyByDateOf(bookings, time) {
  const busyByDate = new Map();
  bookings.forEach((b) => {
    slotsOf(b).filter((s) => s.time === time).forEach((s) => {
      if (!busyByDate.has(s.date)) busyByDate.set(s.date, new Set());
      getMemberIds(b).forEach((id) => busyByDate.get(s.date).add(id));
    });
  });
  return busyByDate;
}

// Returns the proposal without saving anything:
// { assignment, reason } or { assignment: null, reason, suggestedDates }.
async function proposeAssignment(booking) {
  const ctx = await loadContext(booking);
  const busyIds = ctx.busyByDate.get(booking.date) || new Set();

  const decision = pickAssignment({
    minTechnicians: ctx.minTechnicians, technicians: ctx.technicians, busyIds,
    requestedTechnicianId: booking.requestedTechnician,
    weekBookings: ctx.weekBookings, upcomingBookings: ctx.upcomingBookings,
  });

  if (decision.assignment) return decision;

  return {
    ...decision,
    suggestedDates: findNextFreeDates({
      minTechnicians: ctx.minTechnicians, technicians: ctx.technicians, afterDateKey: booking.date, busyByDate: ctx.busyByDate, closedDates: ctx.closedDates,
    }),
  };
}

// The next dates (up to `limit`, business days only: no Sundays while they are closed, no closure dates) on which enough
// technicians are free in this booking's time block. Used when approving or assigning fails because nobody is free.
async function suggestNextDates(booking, { limit = 3 } = {}) {
  const ctx = await loadContext(booking);
  return findNextFreeDates({
    minTechnicians: ctx.minTechnicians, technicians: ctx.technicians, afterDateKey: booking.date, busyByDate: ctx.busyByDate, closedDates: ctx.closedDates, limit,
  });
}

// The same, from data the caller already has (the Pending queue loads every active booking once): `occupying` are the
// bookings that hold technicians, `booking` the request to find dates for.
function suggestFromBookings({ booking, minTechnicians, technicians, occupying, closedDates, limit = 3 }) {
  const others = occupying.filter((b) => b.bookingId !== booking.bookingId);
  return findNextFreeDates({
    minTechnicians, technicians, afterDateKey: booking.date, busyByDate: busyByDateOf(others, booking.time), closedDates, limit,
  });
}

module.exports = {
  pickAssignment, findNextFreeDates, proposeAssignment, suggestNextDates, suggestFromBookings, weekRange, addDays,
};
