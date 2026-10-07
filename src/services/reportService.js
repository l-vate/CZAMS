import { request } from './apiClient';

// Admin: every service report.
export function listReports() {
  return request('/api/reports');
}

// The report filed for one booking (404 when there is none yet).
export function getReportForBooking(bookingId) {
  return request(`/api/reports/booking/${bookingId}`);
}

// Technician: file the service report for a job.
export function submitReport(report) {
  return request('/api/reports', { method: 'POST', body: report });
}
