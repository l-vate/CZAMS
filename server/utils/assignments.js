// Who is assigned to a booking, and the rules around it. Every other file asks these
// functions instead of reading booking.technician directly, so teams, solo technicians
// and bookings made before teams existed all behave the same way.
const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const Booking = require('../models/Booking');
const TechnicianOff = require('../models/TechnicianOff');
const { offIdsAt, offRowsBetween } = require('./technicianOff');

const scheduling = require('../constants/scheduling');

// The statuses that hold a technician's time block. Whether Pending is one of them is an owner decision,
// kept in one place (constants/scheduling.js PENDING_HOLDS_SLOT). A function, so the value is read each time.
const activeStatuses = () => (scheduling.PENDING_HOLDS_SLOT
  ? [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS]
  : [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS]);

const { slotsOf } = require('./extensionDays');
// Teams no longer exist as something to manage, but old bookings still carry the id of the team they were assigned
// through, and ASSIGNMENT_POPULATE below shows its name. Populating needs the model registered, so it is loaded here.
require('../models/Team');

const idOf = (x) => (x ? String(x._id || x) : null);

// Populate paths that turn the stored ids into names. Spread into populate() calls.
const ASSIGNMENT_POPULATE = [
  { path: 'assignments.lead', select: 'name' },
  { path: 'assignments.helper', select: 'name' },
  { path: 'assignments.team', select: 'name' },
  // Not an assignment, but every route that returns a booking already spreads this list, so the
  // name of the admin who reviewed the discount rides along with it.
  { path: 'discount.reviewedBy', select: 'name' },
];

// The booking's assignments as plain { team, lead, helper } with string ids. A booking with
// no assignments but a technician (made before teams) is a solo assignment: nothing is
// migrated or rewritten, the old data is just read this way.
function getAssignments(booking) {
  const list = (booking?.assignments || []).map((a) => ({
    team: idOf(a.team),
    lead: idOf(a.lead),
    helper: idOf(a.helper),
  })).filter((a) => a.lead);
  if (list.length > 0) return list;
  const legacy = idOf(booking?.technician);
  return legacy ? [{ team: null, lead: legacy, helper: null }] : [];
}

function getMemberIds(booking) {
  const ids = [];
  getAssignments(booking).forEach((a) => {
    ids.push(a.lead);
    if (a.helper) ids.push(a.helper);
  });
  return [...new Set(ids)];
}

// The admin picks technicians one by one, and each is saved as its own entry with no helper. The first entry is the primary technician (the
// "lead"); an entry after the first that has no helper is a technician added to the list, who has the helper's rights on the job (they see it,
// they are held in their slot, but they do not file the service report or report a disruption). An entry with a helper is a pair, as on
// bookings made before the flat list: its lead is a lead.
const isAddedTechnician = (assignment, index) => index > 0 && !assignment.helper;

function getLeadIds(booking) {
  return [...new Set(getAssignments(booking).filter((a, i) => !isAddedTechnician(a, i)).map((a) => a.lead))];
}

// The primary lead is the lead of the first pair. On a job with several pairs only the primary lead files the
// service report; every other lead and every helper reads it. Reordering or replacing the first pair changes who it is.
function getPrimaryLeadId(booking) {
  return getAssignments(booking)[0]?.lead || null;
}

// 'Lead', 'Helper', or null for someone not on the job.
function getRoleFor(booking, userId) {
  const id = idOf(userId);
  if (getLeadIds(booking).includes(id)) return 'Lead';
  if (getAssignments(booking).some((a, i) => a.helper === id || (isAddedTechnician(a, i) && a.lead === id))) return 'Helper';
  return null;
}

// How many technicians a service needs: 1 (a solo technician) or 2.
// The paper allows a solo technician only for a check-up or a survey visit; everything else, Cleaning
// above all, needs a lead and a helper. So:
//   - a service flagged minTechnicians = 2 always needs a pair;
//   - a Check-up needs one by default;
//   - an admin can mark a survey as solo with minTechnicians = 1, but only on a service of type Other
//     (a survey has no type of its own); the flag 1 is ignored on Cleaning, Installation, Repair,
//     Maintenance and Leak Repair, which always need a pair;
//   - everything else needs a pair.
function getMinTechnicians(service) {
  if (service?.minTechnicians === 2) return 2;
  const type = service?.serviceType;
  if (type === SERVICE_TYPE.CHECK_UP) return 1;
  if (service?.minTechnicians === 1 && type === SERVICE_TYPE.OTHER) return 1;
  return 2;
}

// How many different technicians a list of assignments names. The admin now picks technicians one by one (each saved as its own entry
// with no helper); an older booking may still hold a lead and a helper in one entry, and both count.
function countTechnicians(assignments) {
  return new Set((assignments || []).flatMap((a) => (a && a.lead ? [idOf(a.lead), a.helper ? idOf(a.helper) : null] : [])).filter(Boolean)).size;
}

// Whether a list of assignments meets what the service needs: at least getMinTechnicians(service) different technicians.
function isStaffed(assignments, service) {
  return countTechnicians(assignments) >= getMinTechnicians(service);
}

// null when the job is staffed, otherwise the sentence for the admin. `when` is 'approving' or 'saving'.
function staffingProblem(assignments, service, when = 'approving') {
  if (isStaffed(assignments, service)) return null;
  const name = service?.name || 'This service';
  const needsTwo = getMinTechnicians(service) === 2;
  const nobody = countTechnicians(assignments) === 0;
  if (!needsTwo) return 'Assign a technician before approving.';
  if (nobody) return `${name} needs at least two technicians. Assign them before ${when === 'approving' ? 'approving' : 'saving'}.`;
  return when === 'approving'
    ? `${name} needs at least two technicians. Add another technician before approving.`
    : `${name} needs at least two technicians. A technician cannot be removed from it, choose another technician instead.`;
}

// Mongo filter for "this technician is on the booking in any role".
function memberFilter(userIds) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  return {
    $or: [
      { technician: { $in: ids } },
      { 'assignments.lead': { $in: ids } },
      { 'assignments.helper': { $in: ids } },
    ],
  };
}

// A technician (any role, any team) already on another Pending / Approved / In Progress
// booking in the same date and time block cannot be put on this one. Every member of every
// team counts. Used by create, assign, reassign, reschedule, approve-reschedule and
// disruption reschedule, so it is one rule everywhere.
async function findConflictingBooking(technicianIds, date, time, excludeBookingId) {
  const ids = (Array.isArray(technicianIds) ? technicianIds : [technicianIds]).map(idOf).filter(Boolean);
  if (ids.length === 0 || !date || !time) return null;
  // The booking's own date and block, or one of its approved extra days.
  return Booking.findOne({
    $and: [
      memberFilter(ids),
      { $or: [{ date, time }, { extensionDays: { $elemMatch: { date, time } } }] },
    ],
    status: { $in: activeStatuses() },
    ...(excludeBookingId ? { bookingId: { $ne: excludeBookingId } } : {}),
  });
}

// Ids of every technician busy in a date/time block (optionally ignoring one booking), counting approved extra days.
async function getBusyTechnicianIds(date, time, excludeBookingId) {
  const slot = time ? { date, time } : { date };
  const bookings = await Booking.find({
    $or: [slot, { extensionDays: { $elemMatch: slot } }],
    status: { $in: activeStatuses() },
    ...(excludeBookingId ? { bookingId: { $ne: excludeBookingId } } : {}),
  });
  const busy = bookings.filter((b) => slotsOf(b).some((s) => s.date === date && (!time || s.time === time)));
  // a technician the admin marked as not available counts as busy too (without a time: in either block)
  const offRows = await offRowsBetween(TechnicianOff, date, date);
  const off = time ? [...offIdsAt(offRows, date, time)] : offRows.map((r) => String(r.technician));
  return [...new Set([...busy.flatMap(getMemberIds), ...off])];
}

// Which of these technicians the admin marked as not available on `date` in `time` (an array of ids, empty when none).
async function findOffTechnicianIds(technicianIds, date, time) {
  const ids = (Array.isArray(technicianIds) ? technicianIds : [technicianIds]).map(idOf).filter(Boolean);
  if (ids.length === 0 || !date || !time) return [];
  const off = offIdsAt(await offRowsBetween(TechnicianOff, date, date), date, time);
  return ids.filter((id) => off.has(String(id)));
}

module.exports = {
  activeStatuses,
  ASSIGNMENT_POPULATE,
  idOf,
  getAssignments,
  getMemberIds,
  getLeadIds,
  getPrimaryLeadId,
  getRoleFor,
  getMinTechnicians,
  isStaffed,
  staffingProblem,
  memberFilter,
  findConflictingBooking,
  getBusyTechnicianIds,
  findOffTechnicianIds,
};
