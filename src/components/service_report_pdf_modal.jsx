import { useEffect } from 'react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Same print mechanism as receipt_modal.jsx (window.print() + a print-only visible
// area) but a distinct document — a service report, not an invoice — with its own
// classes rather than reusing the receipt's.
function ServiceReportPdfModal({ report, reportItem, onClose }) {
  useEffect(() => {
    document.body.classList.add('printing-report-pdf-active');
    return () => document.body.classList.remove('printing-report-pdf-active');
  }, []);

  const handlePrint = () => window.print();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="report-pdf-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header report-pdf-modal-header">
          <span />
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="report-pdf-print-area">
          <div className="report-pdf-top-row">
            <div className="report-pdf-brand">
              <img src="/images/logo.png" alt="Cooling Zone Logo" className="report-pdf-logo" />
              <div>
                <p className="report-pdf-brand-name">Cooling Zone Aircon Services</p>
                <p className="report-pdf-brand-sub">Service Report</p>
              </div>
            </div>
            <div className="report-pdf-meta">
              <p>Booking ID: {reportItem.bookingId}</p>
              <p>Submitted: {formatDate(report.submittedAt)}</p>
            </div>
          </div>

          <div className="report-pdf-section">
            <p className="report-pdf-section-title">Service Details</p>
            <div className="report-pdf-row"><span>Service</span><span>{reportItem.service}</span></div>
            <div className="report-pdf-row"><span>Customer</span><span>{reportItem.customer}</span></div>
            <div className="report-pdf-row"><span>Address</span><span>{reportItem.address}</span></div>
            <div className="report-pdf-row"><span>Service Date</span><span>{reportItem.bookingDate}</span></div>
          </div>

          <div className="report-pdf-section">
            <p className="report-pdf-section-title">Work Performed</p>
            <p className="report-pdf-text">{report.workSummary}</p>
            {report.partsUsed && (
              <>
                <p className="report-pdf-label">Parts Used</p>
                <p className="report-pdf-text">{report.partsUsed}</p>
              </>
            )}
            <div className="report-pdf-row"><span>Resolution</span><span>{report.issueResolution || '—'}</span></div>
            {report.laborHours ? (
              <div className="report-pdf-row"><span>Labor Hours</span><span>{report.laborHours} hrs</span></div>
            ) : null}
          </div>

          {report.preExistingIssue?.flagged && (
            <div className="report-pdf-section">
              <p className="report-pdf-section-title">Pre-existing Issue Noted at Time of Service</p>
              <p className="report-pdf-text">{report.preExistingIssue.description}</p>
            </div>
          )}

          {report.recommendations && (
            <div className="report-pdf-section">
              <p className="report-pdf-section-title">Recommendations</p>
              <p className="report-pdf-text">{report.recommendations}</p>
            </div>
          )}

          {report.followUpRequired && (
            <div className="report-pdf-section">
              <p className="report-pdf-section-title">Follow-up</p>
              <p className="report-pdf-text">Required — {formatDate(report.followUpDate)}</p>
            </div>
          )}

          {report.notes && (
            <div className="report-pdf-section">
              <p className="report-pdf-section-title">Additional Notes</p>
              <p className="report-pdf-text">{report.notes}</p>
            </div>
          )}

          <div className="report-pdf-section report-pdf-consent">
            <p className="report-pdf-section-title">Client Consent</p>
            <p className="report-pdf-text">I confirm the above work was completed to my satisfaction.</p>
            {report.clientConsent?.signatureDataUrl && (
              <img
                src={report.clientConsent.signatureDataUrl}
                alt="Client signature"
                className="report-pdf-signature-img"
              />
            )}
            <div className="report-pdf-row">
              <span>Signed by</span>
              <span>{report.clientConsent?.signedName || '—'}</span>
            </div>
            <div className="report-pdf-row">
              <span>Date</span>
              <span>{formatDateTime(report.clientConsent?.signedAt)}</span>
            </div>
          </div>
        </div>

        <button className="modal-submit-btn report-pdf-print-btn" onClick={handlePrint}>
          🖨 Print / Save as PDF
        </button>
      </div>
    </div>
  );
}

export default ServiceReportPdfModal;
