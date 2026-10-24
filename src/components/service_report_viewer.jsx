import { useEffect, useState } from 'react';
import ServiceReportPdfModal from './service_report_pdf_modal';
import { ApiError } from '../services/apiClient';
import { getReportForBooking } from '../services/reportService';
import { unitSourceLabel } from '../utils/warrantyText';
import { customerLabel } from '../utils/customerLabel';

// A read-only service report with the PDF button, for people who may read a report but not file it: the helper
// and a non-primary lead on the job, and the customer who owns the booking. It loads the report by booking and
// shows it in the same modal the lead and the admin use for the PDF. The server decides who may read it.
function ServiceReportViewer({ bookingId, fallback = {}, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getReportForBooking(bookingId)
      .then((data) => { if (!cancelled) setReport(data); })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError && err.status === 404 ? 'No service report has been filed for this booking yet.' : 'Could not load the service report. Try again.');
      });
    return () => { cancelled = true; };
  }, [bookingId]);

  if (report) {
    const details = report.bookingDetails || {};
    const reportItem = {
      bookingId,
      service: details.service?.name || fallback.service || 'Service',
      customer: customerLabel(details.customer, fallback.customer || 'Customer'),
      address: details.address || fallback.address || 'Address not available',
      unitSource: unitSourceLabel(details),
      bookingDate: (details.date || fallback.date) ? new Date(details.date || fallback.date).toLocaleDateString() : 'Date not available',
    };
    return <ServiceReportPdfModal report={report} reportItem={reportItem} onClose={onClose} />;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="report-pdf-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header report-pdf-modal-header">
          <span />
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">x</button>
        </div>
        <p className="report-pdf-text" role={error ? 'alert' : 'status'}>{error || 'Loading the service report...'}</p>
      </div>
    </div>
  );
}

export default ServiceReportViewer;
