// Sort orders for the technician's My Jobs list. Four distinct sorts: two by when the booking was
// made, one by the service date, one by status.
import { BOOKING_STATUS } from '../constants/bookingStatus.js';

export const JOB_SORT = Object.freeze({
  NEWEST: 'newest',
  OLDEST: 'oldest',
  SERVICE_SOONEST: 'service-soonest',
  STATUS: 'status',
});

export const JOB_SORT_OPTIONS = Object.freeze([
  { value: JOB_SORT.NEWEST, label: 'Newest booking created' },
  { value: JOB_SORT.OLDEST, label: 'Oldest booking created' },
  { value: JOB_SORT.SERVICE_SOONEST, label: 'Service date soonest' },
  { value: JOB_SORT.STATUS, label: 'Status' },
]);

// Work that needs attention first. A status not listed (such as Pending) goes last.
const STATUS_ORDER = Object.freeze([
  BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.APPROVED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
]);

const statusRank = (status) => {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
};

// Handles "07-08-26" (mm-dd-yy) or an ISO date string.
export function parseJobDate(dateStr) {
  if (!dateStr) return new Date(0);
  if (dateStr.includes('-') && dateStr.length <= 8) {
    const [mm, dd, yy] = dateStr.split('-').map(Number);
    return new Date(2000 + yy, mm - 1, dd);
  }
  return new Date(dateStr);
}

const byDate = (a, b) => parseJobDate(a.date).getTime() - parseJobDate(b.date).getTime();

// When the booking was made. A booking with no created time sorts as the oldest.
const createdMs = (job) => {
  const t = job.createdAt ? new Date(job.createdAt).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
};

// Oldest booking first; bookings made at the same time (or with no created time) keep service date order.
const byCreated = (a, b) => createdMs(a) - createdMs(b) || byDate(a, b);

// A new sorted array; `jobs` is left alone.
export function sortJobs(jobs, sortBy) {
  const list = [...jobs];
  switch (sortBy) {
    case JOB_SORT.OLDEST:
      return list.sort(byCreated);
    case JOB_SORT.SERVICE_SOONEST:
      return list.sort(byDate);
    case JOB_SORT.STATUS:
      return list.sort((a, b) => statusRank(a.status) - statusRank(b.status) || byDate(a, b));
    case JOB_SORT.NEWEST:
    default:
      return list.sort((a, b) => byCreated(b, a));
  }
}
