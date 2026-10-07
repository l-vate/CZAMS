// Auto-assign: choose who should do a booking. The choosing itself (pickAssignment and
// findNextFreeDates) is pure: it takes plain data and returns an answer, so it can be
// tested without a database. proposeAssignment gathers the data and calls them.
//
// Rules, in order:
//  1. Only active teams whose members are BOTH free in the booking's date and time block are
//     candidates (for a service that needs just one technician, any free active technician).
//  2. If the customer asked for a technician and that technician (or their team) is a
//     candidate, choose it.
//  3. Otherwise choose the candidate with the fewest bookings in the booking's Monday to
//     Sunday week. Ties: fewest upcoming bookings overall, then the name (A to Z).
//  4. Nobody free: say so, and suggest up to 3 later dates where someone is.
const { ROLE } = require('../constants/roles');
const Team = require('../models/Team');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { ACTIVE_STATUSES, getMemberIds, getMinTechnicians } = require('./assignments');
const { manilaTodayKey } = require('./timeBlocks');

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

const isSunday = (key) => toUtc(key).getUTCDay() === 0;

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
 * @param {number} input.minTechnicians  1 (a single technician will do) or 2 (a team)
 * @param {{_id,name,lead,helper}[]} input.teams          active teams, lead/helper as ids
 * @param {{_id,name}[]} input.technicians                active technicians
 * @param {Iterable<string>} input.busyIds                technicians busy in this date and block
 * @param {string} [input.requestedTechnicianId]
 * @param {string[][]} input.weekBookings                 member ids of each booking that week
 * @param {string[][]} input.upcomingBookings             member ids of each upcoming booking
 * @returns {{ assignment: null | {teamId} | {technicianId}, reason: string }}
 */
function pickAssignment({
  minTechnicians, teams, technicians, busyIds, requestedTechnicianId,
  weekBookings = [], upcomingBookings = [],
}) {
  const busy = new Set(busyIds);
  const requestedName = technicians.find((t) => t._id === requestedTechnicianId)?.name;

  let candidates;
  if (minTechnicians <= 1) {
    candidates = technicians
      .filter((t) => !busy.has(t._id))
      .map((t) => ({ kind: 'technician', id: t._id, name: t.name, memberIds: [t._id] }));
  } else {
    candidates = teams
      .filter((t) => !busy.has(t.lead) && !busy.has(t.helper))
      .map((t) => ({ kind: 'team', id: t._id, name: t.name, memberIds: [t.lead, t.helper] }));
  }

  if (candidates.length === 0) {
    return {
      assignment: null,
      reason: minTechnicians <= 1
        ? 'No technician is free for this date and time block.'
        : 'No team is free for this date and time block (a team is free only if both members are).',
    };
  }

  const toAssignment = (c) => (c.kind === 'team' ? { teamId: c.id } : { technicianId: c.id });

  // 2. the customer's requested technician, if they (or their team) are free
  if (requestedTechnicianId) {
    const preferred = candidates.find((c) => c.memberIds.includes(requestedTechnicianId));
    if (preferred) {
      return {
        assignment: toAssignment(preferred),
        reason: preferred.kind === 'team'
          ? `${requestedName || 'The technician the customer asked for'} is free, so their team, ${preferred.name}, was chosen.`
          : `${preferred.name}, the technician the customer asked for, is free, so they were chosen.`,
      };
    }
  }

  // 3. lightest week, then fewest upcoming, then name
  const ranked = candidates.map((c) => rank(c, weekBookings, upcomingBookings)).sort(byLoadThenName);
  const best = ranked[0];
  const tiedOnWeek = ranked.filter((c) => c.weekLoad === best.weekLoad);
  const tiedOnBoth = tiedOnWeek.filter((c) => c.upcomingLoad === best.upcomingLoad);

  let reason = `${best.name} has the fewest bookings that week (${plural(best.weekLoad, 'booking')}).`;
  if (requestedTechnicianId && !candidates.some((c) => c.memberIds.includes(requestedTechnicianId))) {
    reason = `${requestedName || 'The technician the customer asked for'} is busy then. ${reason}`;
  }
  if (tiedOnWeek.length > 1) {
    reason += tiedOnBoth.length > 1
      ? ` ${plural(tiedOnBoth.length, 'candidate')} tied on both that week and upcoming bookings, so the name (A to Z) decided.`
      : ` ${plural(tiedOnWeek.length, 'candidate')} tied for the week; ${best.name} has the fewest upcoming bookings (${best.upcomingLoad}).`;
  }

  return { assignment: toAssignment(best), reason };
}

/**
 * Up to `limit` later dates (Sundays skipped, the shop is closed) on which someone is free in
 * the same time block. busyByDate maps a date key to the set of busy technician ids.
 */
function findNextFreeDates({
  minTechnicians, teams, technicians, afterDateKey, busyByDate, limit = 3, searchDays = 60,
}) {
  const found = [];
  for (let i = 1; i <= searchDays && found.length < limit; i += 1) {
    const key = addDays(afterDateKey, i);
    if (isSunday(key)) continue;
    const busy = busyByDate.get(key) || new Set();
    const someoneFree = minTechnicians <= 1
      ? technicians.some((t) => !busy.has(t._id))
      : teams.some((t) => !busy.has(t.lead) && !busy.has(t.helper));
    if (someoneFree) found.push(key);
  }
  return found;
}

// ---------- the database side

// `booking` must have its service populated. Returns the proposal without saving anything:
// { assignment, reason } or { assignment: null, reason, suggestedDates }.
async function proposeAssignment(booking) {
  const minTechnicians = getMinTechnicians(booking.service);
  const members = await User.find({ role: ROLE.STAFF, isActive: true }).select('name');
  const activeIds = new Set(members.map((u) => u._id));

  const teamDocs = await Team.find({ isActive: true }).select('name lead helper');
  const teams = teamDocs
    .filter((t) => activeIds.has(t.lead) && activeIds.has(t.helper)) // a deactivated member sidelines the team
    .map((t) => ({ _id: String(t._id), name: t.name, lead: t.lead, helper: t.helper }));
  const technicians = members.map((u) => ({ _id: u._id, name: u.name }));

  // Everything on the books in the surrounding weeks and from today on, excluding this booking.
  const { start, end } = weekRange(booking.date);
  const today = manilaTodayKey();
  const horizon = addDays(booking.date, 61);
  const nearby = await Booking.find({
    status: { $in: ACTIVE_STATUSES },
    bookingId: { $ne: booking.bookingId },
    date: { $gte: start < today ? start : today, $lte: horizon },
  }).select('date time technician assignments');

  const memberLists = (docs) => docs.map((b) => getMemberIds(b));
  const weekBookings = memberLists(nearby.filter((b) => b.date >= start && b.date <= end));
  const upcomingBookings = memberLists(nearby.filter((b) => b.date >= today));

  const busyByDate = new Map();
  nearby.filter((b) => b.time === booking.time).forEach((b) => {
    if (!busyByDate.has(b.date)) busyByDate.set(b.date, new Set());
    getMemberIds(b).forEach((id) => busyByDate.get(b.date).add(id));
  });
  const busyIds = busyByDate.get(booking.date) || new Set();

  const decision = pickAssignment({
    minTechnicians, teams, technicians, busyIds,
    requestedTechnicianId: booking.requestedTechnician,
    weekBookings, upcomingBookings,
  });

  if (decision.assignment) return decision;

  return {
    ...decision,
    suggestedDates: findNextFreeDates({
      minTechnicians, teams, technicians, afterDateKey: booking.date, busyByDate,
    }),
  };
}

module.exports = {
  pickAssignment, findNextFreeDates, proposeAssignment, weekRange, addDays,
};
