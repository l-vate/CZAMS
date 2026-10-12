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

// How many technicians a service needs. Explicit value wins; otherwise a Check-up
// (or survey) visit needs one and everything else needs a pair.
function getMinTechnicians(service) {
  if (service?.minTechnicians === 1 || service?.minTechnicians === 2) return service.minTechnicians;
  return service?.serviceType === SERVICE_TYPE.CHECK_UP ? 1 : 2;
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
  memberFilter,
  findConflictingBooking,
  getBusyTechnicianIds,
};
