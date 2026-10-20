import { TIME_BLOCKS } from "../config/timeBlocks";

// The calendar's own status vocabulary (matches the .cal-job-*/.cal-dot-* CSS
// classes below) doesn't literally match Booking.status's enum - "Approved"
// and "In Progress" had no mapping at all before this, so job blocks/chips for
// those two statuses rendered with no color styling. Exported so both
// admin/calendar.jsx and staff/calendar.jsx map bookings the same way.
const CALENDAR_STATUS_MAP = {
  pending: "pending",
  approved: "confirmed",
  "in progress": "in-progress",
  completed: "completed",
  cancelled: "cancelled",
};

export function mapBookingStatusToCalendarStatus(status) {
  return CALENDAR_STATUS_MAP[(status || "pending").toLowerCase()] || "pending";
}

// Booking.time is literally the string "Morning" or "Afternoon" (Step3's time
// toggle, book_service.jsx) - never a parseable "9:00 AM - 11:00 AM" range, and
// there are no startTime/endTime fields on Booking at all. The Week/Day grid
// still needs *some* start/end hour to position a block, so this maps each block
// to a fixed range grounded in the app's own stated hours (landing_page.jsx
// footer: Mon–Sat 8:00 AM–6:00 PM), with a lunch gap between them - so a
// Morning-only booking visually reads as busy 8–12 and free in the afternoon,
// not "busy all day" or an arbitrary slot unrelated to which block was actually booked.
// Exported so both admin/calendar.jsx and staff/calendar.jsx derive this the same way.
// The hours come from server/constants/timeBlocks.json, the same file the server's status job reads.
export function getTimeBlockHours(time) {
  return TIME_BLOCKS[time] || { startHour: 8, endHour: 10 };
}
