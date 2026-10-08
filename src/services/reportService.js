import { request, upload } from './apiClient';

// Admin: every service report.
export function listReports() {
  return request('/api/reports');
}

// The report filed for one booking (404 when there is none yet).
export function getReportForBooking(bookingId) {
  return request(`/api/reports/booking/${bookingId}`);
}

// Technician: file the service report for a job. `photo` is the optional photo (JPG or PNG,
// 5 MB at most) of the signed paper form; with it the drawn signature and name become optional.
export function submitReport(report, photo) {
  const formData = new FormData();
  Object.entries(report).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') formData.append(key, value);
  });
  if (photo) formData.append('photo', photo);
  return upload('/api/reports', formData);
}
