// Scheduling switches that are an OWNER DECISION. Each is one value in one place.
//
// PENDING_HOLDS_SLOT
//   true  (current behavior): a Pending booking that already has technicians assigned counts as busy, so
//         those technicians cannot be given to another booking in the same date and time block, and
//         Pending requests also use up free technicians on the public availability calendar.
//   false: only Approved and In Progress bookings hold a slot. Pending bookings never block anyone, so the
//         same technician can be proposed for several Pending requests; the conflict is then checked when
//         the admin approves (routes/bookingRoutes.js, the Approve step), and the admin sees a 409.
//
// Everything that decides "who is busy" reads it through activeStatuses() in utils/assignments.js:
//   utils/assignments.js    findConflictingBooking, getBusyTechnicianIds
//   utils/autoAssign.js     proposeAssignment (the load and busy figures it ranks by)
//   utils/availability.js   getAvailability (public calendar)
//   utils/queue.js          getQueue (free technicians and pairs shown in the Pending queue)
//   routes/bookingRoutes.js the approval check, which only runs when this is false
const scheduling = {
  PENDING_HOLDS_SLOT: true,
};

module.exports = scheduling;
