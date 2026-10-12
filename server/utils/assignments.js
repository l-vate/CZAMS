// Who is assigned to a booking, and the rules around it. Every other file asks these
// functions instead of reading booking.technician directly, so teams, solo technicians
// and bookings made before teams existed all behave the same way.
const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const Booking = require('../models/Booking');

const scheduling = require('../constants/scheduling');

// The statuses that hold a technician's time block. Whether Pending is one of them is an owner decision,
// kept in one place (constants/scheduling.js PENDING_HOLDS_SLOT). A function, so the value is read each time.
const activeStatuses = () => (scheduling.PENDING_HOLDS_SLOT
  ? [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS]
  : [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS]);

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

function getLeadIds(booking) {
  return [...new Set(getAssignments(booking).map((a) => a.lead))];
}

// 'Lead', 'Helper', or null for someone not on the job.
function getRoleFor(booking, userId) {
  const id = idOf(userId);
  if (getLeadIds(booking).includes(id)) return 'Lead';
  if (getAssignments(booking).some((a) => a.helper === id)) return 'Helper';
  return null;
}

// How many technicians a service needs: 1 (a solo technician) or 2 (a lead and a helper).
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

// Whether a list of { lead, helper } meets what the service needs: one technician for a solo service, and for
// a pair service at least one assignment that has BOTH a lead and a helper (two leads alone are not a pair).
function isStaffed(assignments, service) {
  const list = (assignments || []).filter((a) => a && a.lead);
  if (getMinTechnicians(service) === 1) return list.length > 0;
  return list.some((a) => a.lead && a.helper);
}

// null when the job is staffed, otherwise the sentence for the admin. `when` is 'approving' or 'saving'.
function staffingProblem(assignments, service, when = 'approving') {
  if (isStaffed(assignments, service)) return null;
  const name = service?.name || 'This service';
  const needsPair = getMinTechnicians(service) === 2;
  const nobody = !(assignments || []).some((a) => a && a.lead);
  if (!needsPair) return 'Assign a technician before approving.';
  if (nobody) return `${name} needs a lead technician and a helper. Assign them before ${when === 'approving' ? 'approving' : 'saving'}.`;
  return when === 'approving'
    ? `${name} needs a lead technician and a helper. Add a helper before approving.`
    : `${name} needs a lead technician and a helper. A helper cannot be removed from it, choose another helper instead.`;
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
  return Booking.findOne({
    ...memberFilter(ids),
    date,
    time,
    status: { $in: activeStatuses() },
    ...(excludeBookingId ? { bookingId: { $ne: excludeBookingId } } : {}),
  });
}

// Ids of every technician busy in a date/time block (optionally ignoring one booking).
async function getBusyTechnicianIds(date, time, excludeBookingId) {
  const bookings = await Booking.find({
    date,
    ...(time ? { time } : {}),
    status: { $in: activeStatuses() },
    ...(excludeBookingId ? { bookingId: { $ne: excludeBookingId } } : {}),
  });
  return [...new Set(bookings.flatMap(getMemberIds))];
}

module.exports = {
  activeStatuses,
  ASSIGNMENT_POPULATE,
  idOf,
  getAssignments,
  getMemberIds,
  getLeadIds,
  getRoleFor,
  getMinTechnicians,
  isStaffed,
  staffingProblem,
  memberFilter,
  findConflictingBooking,
  getBusyTechnicianIds,
};
