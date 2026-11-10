import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from './staff_layout';
import { FiClock, FiFileText, FiX, FiUser, FiMapPin } from 'react-icons/fi';
import ServiceReportPdfModal from '../../components/service_report_pdf_modal';
import { getFilterPillStyle } from '../../utils/statusColors';
import LoadError from '../../components/load_error';
import { listTechnicianJobs } from '../../services/bookingService';
import { listMyReports } from '../../services/reportService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { ProofLink, ProofImage } from '../../components/proof_file';
import { BackJobBadge } from '../../components/back_job_info';
import { toReportItem } from '../../utils/reportItem';


function ViewReportModal({ reportItem, onClose }) {
  const { report } = reportItem;
  const [showPdf, setShowPdf] = useState(false);

  const getResolutionStyle = (res) => {
    switch (res) {
      case 'Complete':
        return 'tech-status-completed';
      case 'Partial':
        return 'tech-status-in-progress';
      default:
        return 'tech-status-in-progress';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Service Report</h4>
          <button className="modal-close-btn" onClick={onClose}><FiX /></button>
        </div>

        <div className="report-booking-info staff-reports-x1">
          <p className="tech-job-detail-booking">
            {reportItem.service} · {reportItem.bookingId}
          </p>
          <div className="tech-job-detail-grid">
            {reportItem.customer && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiUser /></span>
                <div>
                  <p className="confirmation-detail-label">Customer</p>
                  <p className="confirmation-detail-value">{reportItem.customer}</p>
                </div>
              </div>
            )}
            {reportItem.address && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiMapPin /></span>
                <div>
                  <p className="confirmation-detail-label">Location</p>
                  <p className="confirmation-detail-value">{reportItem.address}</p>
                </div>
              </div>
            )}
            {reportItem.bookingDate && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiClock /></span>
                <div>
                  <p className="confirmation-detail-label">Service Date</p>
                  <p className="confirmation-detail-value">{reportItem.bookingDate}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="tech-job-detail-grid staff-reports-x16">
          {report.backJob?.originalBookingId && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <div>
                <p className="confirmation-detail-label">Back job</p>
                <p className="confirmation-detail-value">Follows booking {report.backJob.originalBookingId}{report.backJob.originalReportId ? ' and its original report' : ''}</p>
              </div>
            </div>
          )}

          {/* Work Summary */}
          <div className="tech-job-detail-cell tech-job-detail-full">
            <span className="confirmation-detail-icon"><FiFileText /></span>
            <div>
              <p className="confirmation-detail-label">Work Summary</p>
              <p className="confirmation-detail-value">{report.workSummary}</p>
            </div>
          </div>

          {/* Labor Hours */}
          {report.laborHours > 0 && (
            <div className="tech-job-detail-cell">
              <span className="confirmation-detail-icon"><FiClock /></span>
              <div>
                <p className="confirmation-detail-label">Labor Hours</p>
                <p className="confirmation-detail-value">{report.laborHours} hrs</p>
              </div>
            </div>
          )}

          {/* Issue Resolution */}
          {report.issueResolution && (
            <div className="tech-job-detail-cell">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Resolution</p>
                <span className={`tech-job-status-badge ${getResolutionStyle(report.issueResolution)}`}>
                  {report.issueResolution}
                </span>
              </div>
            </div>
          )}

          {/* Parts Used */}
          {report.partsUsed && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Parts Used</p>
                <p className="confirmation-detail-value">{report.partsUsed}</p>
              </div>
            </div>
          )}

          {/* Follow-up Required */}
          {report.followUpRequired && (
            <>
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiFileText /></span>
                <div>
                  <p className="confirmation-detail-label">Follow-up</p>
                  <p className="confirmation-detail-value">Yes</p>
                </div>
              </div>
              {report.followUpDate && (
                <div className="tech-job-detail-cell">
                  <span className="confirmation-detail-icon"><FiClock /></span>
                  <div>
                    <p className="confirmation-detail-label">Follow-up Date</p>
                    <p className="confirmation-detail-value">
                      {new Date(report.followUpDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Recommendations */}
          {report.recommendations && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Recommendations</p>
                <p className="confirmation-detail-value">{report.recommendations}</p>
              </div>
            </div>
          )}

          {/* Additional Notes */}
          {report.notes && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Additional Notes</p>
                <p className="confirmation-detail-value">{report.notes}</p>
              </div>
            </div>
          )}

          {/* Pre-existing Issue */}
          {report.preExistingIssue?.flagged && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Pre-existing Issue Flagged</p>
                <p className="confirmation-detail-value">{report.preExistingIssue.description}</p>
              </div>
            </div>
          )}

          {/* Client Consent */}
          {report.clientConsent?.signedName && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiUser /></span>
              <div>
                <p className="confirmation-detail-label">Client Consent</p>
                <p className="confirmation-detail-value">
                  Signed by {report.clientConsent.signedName}
                  {report.clientConsent.signedAt ? ` on ${new Date(report.clientConsent.signedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
            </div>
          )}

          {report.signedFormPhoto && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <div>
                <p className="confirmation-detail-label">Photo of signed paper form</p>
                <ProofLink path={report.signedFormPhoto}>
                  <ProofImage path={report.signedFormPhoto} alt="Signed paper form" className="report-signed-photo" />
                </ProofLink>
              </div>
            </div>
          )}

          {/* Submitted On */}
          <div className="tech-job-detail-cell tech-job-detail-full">
            <span className="confirmation-detail-icon"><FiClock /></span>
            <div>
              <p className="confirmation-detail-label">Submitted On</p>
              <p className="confirmation-detail-value">
                {report.submittedAt ? new Date(report.submittedAt).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="staff-reports-x17">
          <button
            className="tech-sort-btn staff-reports-x18"
            onClick={onClose}
          >
            Close
          </button>
          <button
            className="tech-sort-btn staff-reports-x19"
            onClick={() => setShowPdf(true)}
          >
            <FiFileText /> Export PDF
          </button>
        </div>
      </div>

      {showPdf && (
        <ServiceReportPdfModal
          report={report}
          reportItem={reportItem}
          onClose={() => setShowPdf(false)}
        />
      )}
    </div>
  );
}

// A completed job whose report could not be loaded. It is neither Pending nor Completed: the technician
// must never be offered "Submit Report" for a job that may already have one.
const UNKNOWN_STATUS = 'Could not check';

function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Pending');
  const [activeReport, setActiveReport] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reportsFailed, setReportsFailed] = useState(false);

  const loadReports = async () => {
    try {
      // First, get all bookings assigned to the technician
      const bookingsData = await listTechnicianJobs();
      if (!Array.isArray(bookingsData)) throw new Error('Unexpected jobs reply');

      // A job is waiting for its report while it is In Progress (filing the report is what
      // completes it). Completed jobs are listed too, so ones finished before this rule
      // existed that still have no report can get one.
      // Only the primary lead (the lead of the first pair) files the report, so only their jobs are listed here.
      const reportableBookings = bookingsData.filter(b => [BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED].includes(b.status) && b.myRole === 'Lead' && b.isPrimaryLead !== false);

      // One request for every report, instead of one per completed job.
      let reportsByBooking = null;
      try {
        const mine = await listMyReports();
        if (!Array.isArray(mine)) throw new Error('Unexpected reports reply');
        reportsByBooking = new Map(mine.map((r) => [r.bookingId, r]));
      } catch (err) {
        console.error('Failed to load reports', err);
        setReportsFailed(true);
      }

      setReports(reportableBookings.map((booking) => {
        // An In Progress job cannot have a report yet.
        if (booking.status === BOOKING_STATUS.IN_PROGRESS) return toReportItem(booking, null);
        // Reports could not be loaded: we do not know, so it is not shown as Pending.
        if (!reportsByBooking) return { ...toReportItem(booking, null), status: UNKNOWN_STATUS };
        return toReportItem(booking, reportsByBooking.get(booking.bookingId) || null);
      }));
    } catch (err) {
      // a failed load is an error state with a Retry, never "No reports in this category"
      console.error('Failed to load jobs', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const retryLoad = () => {
    setLoadFailed(false);
    setReportsFailed(false);
    setLoading(true);
    loadReports();
  };

  useEffect(() => {
    loadReports();
  }, []);

  // A job that could not be checked needs attention, so it also shows under Pending (labelled as such).
  const visibleReports =
    filter === 'All'
      ? reports
      : reports.filter((r) => r.status === filter || (filter === 'Pending' && r.status === UNKNOWN_STATUS));

  // A pending report is filed on its own page; a finished one is read in a pop-up.
  const handleOpenReport = (reportItem) => {
    if (reportItem.status === 'Pending') {
      navigate(`/staff/reports/${encodeURIComponent(reportItem.bookingId)}/submit`);
      return;
    }
    setActiveReport(reportItem);
  };

  const handleClose = () => setActiveReport(null);

  return (
    <StaffLayout title="Reports">
      <div className="report-tabs">
        {['All', 'Pending', 'Completed'].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`filter-pill ${filter === tab ? 'filter-pill--active' : ''}`}
            style={getFilterPillStyle(tab, filter === tab)}
            onClick={() => setFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {!loading && !loadFailed && reportsFailed && (
        <LoadError message="Could not load your service reports, so some jobs cannot be checked." onRetry={retryLoad} />
      )}

      <div className="tech-job-list">
        {loading ? (
          <p className="tech-job-empty">Loading reports...</p>
        ) : loadFailed ? (
          <LoadError message="Could not load your reports." onRetry={retryLoad} />
        ) : visibleReports.length === 0 ? (
          <p className="tech-job-empty">No reports in this category.</p>
        ) : (
          visibleReports.map((r, i) => (
            <div className="tech-job-card tech-report-card" key={i}>
              <div className="tech-job-info">
                <div className="tech-job-top-row">
                  {r.isBackJob && <BackJobBadge />}
                  <span className={`tech-job-status-badge ${r.status === 'Completed' ? 'tech-status-completed' : r.status === UNKNOWN_STATUS ? 'tech-status-cancelled' : 'tech-status-pending'}`}>
                    {r.status}
                  </span>
                </div>
                <div className="tech-job-service">{r.service}</div>
                <small className="tech-job-booking">{r.bookingId}</small>
                {r.customer && (
                  <small
                    className="tech-job-customer staff-reports-x20"
                  >
                    {r.customer}
                  </small>
                )}
              </div>

              <div className="tech-job-meta">
                <FiClock /> {r.bookingDate}
              </div>

              {r.status === UNKNOWN_STATUS ? (
                <button type="button" className="view-details-btn" onClick={retryLoad}>
                  <FiFileText size={14} /> Retry
                </button>
              ) : (
                <button
                  type="button"
                  className={r.status === 'Pending' ? 'tech-job-primary-btn' : 'view-details-btn'}
                  onClick={() => handleOpenReport(r)}
                >
                  <FiFileText size={14} /> {r.status === 'Pending' ? 'Submit Report' : 'View Report'}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {activeReport && (
        <ViewReportModal reportItem={activeReport} onClose={handleClose} />
      )}
    </StaffLayout>
  );
}

export default Reports;