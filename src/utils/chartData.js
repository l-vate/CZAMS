// Turns the admin bookings list into the data the three charts need. Used by the
// dashboard, Analytics and Reports pages so all of them count the same way.
//
// Dates: bookings carry `createdAt` as an ISO timestamp. Month buckets are worked out
// from the LOCAL calendar month (getFullYear/getMonth), never from toISOString(),
// because converting to UTC pushes a Manila date after 00:00 into the wrong day or month.
import { getStatusColor } from './statusColors';
import { getMembers } from './assignments';
import { BOOKING_STATUS, BOOKING_STATUS_VALUES } from '../constants/bookingStatus';

const STATUS_ORDER = BOOKING_STATUS_VALUES;

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Service requests per month, one bar per month, zeros included.
// `from`/`to` (Dates) set the span; without them it is the last `months` calendar months
// ending this month. A free back-job repair visit is a redo of an already counted
// service, not a new request, so it is not counted.
export function getRequestsPerMonth(bookings, { from, to, months = 6 } = {}) {
  const end = monthStart(to || new Date());
  let start = from ? monthStart(from) : new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  // never more than a year of bars
  const earliest = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  if (start < earliest) start = earliest;

  const buckets = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      year: d.getFullYear(),
      value: 0,
    });
  }

  bookings.forEach((b) => {
    if (b.isBackJob || !b.createdAt) return;
    const created = new Date(b.createdAt);
    const bucket = buckets.find((x) => x.key === `${created.getFullYear()}-${created.getMonth()}`);
    if (bucket) bucket.value += 1;
  });

  const years = [...new Set(buckets.map((b) => b.year))];
  return {
    data: buckets.map(({ label, value }) => ({ label, value })),
    xLabel: years.length > 1 ? `Month (${years[0]} to ${years[years.length - 1]})` : `Month (${years[0]})`,
  };
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
