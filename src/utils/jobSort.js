// Sort orders for the technician's My Jobs list.
import { BOOKING_STATUS } from '../constants/bookingStatus.js';

export const JOB_SORT = Object.freeze({
  NEWEST: 'newest',
  OLDEST: 'oldest',
  SERVICE_SOONEST: 'service-soonest',
  SERVICE_LATEST: 'service-latest',
  STATUS: 'status',
});

export const JOB_SORT_OPTIONS = Object.freeze([
  { value: JOB_SORT.NEWEST, label: 'Newest first' },
  { value: JOB_SORT.OLDEST, label: 'Oldest first' },
  { value: JOB_SORT.SERVICE_SOONEST, label: 'Service date, soonest first' },
  { value: JOB_SORT.SERVICE_LATEST, label: 'Service date, latest first' },
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

// A new sorted array; `jobs` is left alone. Newest and Oldest keep their original meaning (by date).
export function sortJobs(jobs, sortBy) {
  const list = [...jobs];
  switch (sortBy) {
    case JOB_SORT.OLDEST:
    case JOB_SORT.SERVICE_SOONEST:
      return list.sort(byDate);
    case JOB_SORT.STATUS:
      return list.sort((a, b) => statusRank(a.status) - statusRank(b.status) || byDate(a, b));
    case JOB_SORT.NEWEST:
    case JOB_SORT.SERVICE_LATEST:
    default:
      return list.sort((a, b) => byDate(b, a));
  }
}
