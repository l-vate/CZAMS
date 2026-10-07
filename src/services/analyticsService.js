import { orFallback } from './apiClient';
import { listBookings } from './bookingService';
import { listReports } from './reportService';
import { listBackJobs } from './backJobService';
import { listUsers } from './userService';

// Analytics page: everything it charts. A part that fails to load comes back empty so the
// rest of the page still shows.
export async function loadAnalyticsData() {
  const [bookings, reports, backJobs] = await Promise.all([
    orFallback(listBookings(), []),
    orFallback(listReports(), []),
    orFallback(listBackJobs(), []),
  ]);
  return { bookings, reports, backJobs };
}

// Reports page: the data every report is built from. Unlike the analytics page, any part
// failing to load fails the whole load, so a report is never built from partial data.
export async function loadReportData() {
  const [bookings, reports, backJobs, customers, technicians] = await Promise.all([
    listBookings(), listReports(), listBackJobs(), listUsers('customer'), listUsers('staff'),
  ]);
  return { bookings, reports, backJobs, customers, technicians };
}
