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
//   routes/bookingRoutes.js the approval check, which only runs when this is false, and reproposeBlock (moving a request in the
//                           Pending queue makes the proposals for its block again only when this is true)
//
// SUNDAY_CLOSED  (an OWNER DECISION, default true)
//   true:  the shop is closed on Sundays. No booking, reschedule, reschedule approval, disruption reschedule, extra day
//          or back job visit can land on a Sunday, the public calendar shows Sundays as closed, and auto-assign never
//          suggests one. This is what the landing page footer, the public calendar and auto-assign already said.
//   false: Sundays are ordinary days.
//   Every place reads it through utils/businessDays.js (isBusinessDay, nextBusinessDay, businessDayProblem):
//     routes/bookingRoutes.js   create, customer reschedule, reschedule approval, disruption reschedule, extension days
//     routes/backJobRoutes.js   the free visit date
//     utils/extensionDays.js    nextWorkingDayKey, extensionSlotProblem
//     utils/availability.js     the public calendar
//     utils/autoAssign.js       suggested dates
//   The landing page footer line "Sunday: Closed" (src/pages/public/landing_page.jsx) is text and must be edited by hand.
//
// MIN_LEAD_DAYS  (default 3)
//   A booking must be at least this many days ahead of today in Manila. One value, read by:
//     routes/bookingRoutes.js   isDateAllowed (create and customer reschedule)
//     utils/availability.js     the first bookable day on the public calendar
//   The customer pages ask for the same lead through earliestBookingKey(3) in src/utils/manilaTime.js (book_service.jsx and
//   book_details.jsx); change that number by hand too if this one changes.
const scheduling = {
  PENDING_HOLDS_SLOT: true,
  SUNDAY_CLOSED: true,
  MIN_LEAD_DAYS: 3,
};

module.exports = scheduling;
