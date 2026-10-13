// Turns the admin bookings list into the data the three charts need. Used by the
// dashboard, Analytics and Reports pages so all of them count the same way.
//
// Dates: bookings carry `createdAt` as an ISO timestamp. Month buckets are worked out in Manila time
// (utils/monthBuckets.js), never from the browser's own zone and never from toISOString() alone, so the same
// bookings give the same bars wherever the page is opened.
import { getStatusColor } from './statusColors';
import { countPerMonth } from './monthBuckets.js';
import { getMembers } from './assignments';
import { BOOKING_STATUS, BOOKING_STATUS_VALUES } from '../constants/bookingStatus';

const STATUS_ORDER = BOOKING_STATUS_VALUES;

// Service requests per month, one bar per month, zeros included.
// `fromKey`/`toKey` (YYYY-MM-DD) set the span; without them it is the last `months` calendar months
// ending this month. A free back-job repair visit is a redo of an already counted
// service, not a new request, so it is not counted.
// `dateOf` says which date puts a booking in a month (default: when it was requested).
// Months are Manila months (utils/manilaTime.js), whatever time zone the browser is in.
export function getRequestsPerMonth(bookings, { fromKey, toKey, months = 6, dateOf = (b) => b.createdAt } = {}) {
  return countPerMonth(bookings, { fromKey, toKey, months, dateOf, skip: (b) => !!b.isBackJob });
}

// Bookings by status, in the order a booking moves through them. Every booking counts
// here, back-job visits included, because this shows the whole pipeline.
export function getBookingsByStatus(bookings) {
  return STATUS_ORDER.map((status) => ({
    label: status,
    value: bookings.filter((b) => b.status === status).length,
    color: getStatusColor(status),
  }));
}

// Completed jobs per technician, most first. A job counts for every technician on it (lead
// and helper alike). Back-job visits are left out, same as the request metrics.
export function getCompletedPerTechnician(bookings) {
  const counts = new Map();
  bookings.forEach((b) => {
    if (b.status !== BOOKING_STATUS.COMPLETED || b.isBackJob) return;
    getMembers(b).forEach((tech) => {
      const entry = counts.get(tech._id) || { label: tech.name || 'Unknown', value: 0 };
      entry.value += 1;
      counts.set(tech._id, entry);
    });
  });
  return [...counts.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
