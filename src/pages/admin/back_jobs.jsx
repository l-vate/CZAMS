import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from './admin_layout';
import { FiX, FiInfo, FiShield, FiEye } from 'react-icons/fi';
import { getFilterPillStyle } from '../../utils/statusColors';
import { withFallback } from '../../services/apiClient';
import { listBackJobs, markBackJobReviewed } from '../../services/backJobService';
import { BACK_JOB_STATUS } from '../../constants/backJobStatus';
import { customerLabel } from '../../utils/customerLabel';
import { warrantyStatusText, CLEANING_WARRANTY_NOTE } from '../../utils/warrantyText';

// Same badge/left-accent classes as the customer's My Bookings and technician's
// My Jobs cards (staff.css) - .tech-job-card colors its left border automatically
// off whichever of these badge classes it contains.
const STATUS_BADGE_CLASS = {
  Scheduled: 'tech-status-completed',
  'Not Covered': 'tech-status-cancelled',
  Reviewed: 'tech-status-confirmed',
};


const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Scheduled', label: 'Scheduled' },
  { key: 'Not Covered', label: 'Not Covered' },
  { key: 'Reviewed', label: 'Reviewed' },
];

// Green: resolved into a scheduled free repair. Red: needs a manual decision.
// Blue: admin already looked at it. Reuses the existing status-pill color language.
const STATUS_META = {
  Scheduled: { label: 'Scheduled', className: 'status-pill status-pill--full' },
  'Not Covered': { label: 'Not Covered', className: 'status-pill status-pill--rejected' },
  Reviewed: { label: 'Reviewed', className: 'status-pill status-pill--partial' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  return <span className={meta.className}>{meta.label}</span>;
}

function CloseIcon() {
  return <FiX aria-hidden="true" />;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Back Job Detail Modal ──────────────────────────────── */
function BackJobDetailModal({ backJob, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!backJob) return null;

  const isNotCovered = backJob.status === BACK_JOB_STATUS.NOT_COVERED;

  const handleMarkReviewed = async () => {
    setSubmitting(true);
    setError('');
    try {
      await markBackJobReviewed(backJob.backJobId).catch(withFallback('Failed to update back job report.'));
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error reviewing back job:', err);
      setError(err.message || 'Network error while updating.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card payment-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header admin-back-jobs-x1">
          <h4 className="modal-title">Back Job Report</h4>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </button>
        </div>

        <p className="payment-review-booking">{backJob.serviceType} · {backJob.originalBookingId}</p>

        {error && (
          <p className="admin-back-jobs-x2">{error}</p>
        )}

        <div className="payment-review-grid">
          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Client</span>
            <span className="confirmation-detail-value">{backJob.clientName}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Reported On</span>
            <span className="confirmation-detail-value">{formatDate(backJob.reportedAt)}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Warranty Coverage</span>
            <span className="confirmation-detail-value">{backJob.coverageType || 'N/A'}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Status</span>
            <span className="confirmation-detail-value"><StatusBadge status={backJob.status} /></span>
          </div>
        </div>

        <div className="payment-review-cell admin-back-jobs-x3">
          <span className="confirmation-detail-label">Issue Described</span>
          <p className="confirmation-detail-value admin-back-jobs-x4">{backJob.issueDescription}</p>
        </div>

        {backJob.warranty?.applicable && (
          <div className="payment-review-cell admin-back-jobs-x3">
            <span className="confirmation-detail-label">Warranty Status</span>
            <span className="confirmation-detail-value">{warrantyStatusText(backJob.warranty.workmanship.active, backJob.warranty.workmanship.expiresAt)}</span>
          </div>
        )}

        {backJob.coverageType === 'Cleaning' && (
          <div className="refund-flag-notice admin-back-jobs-x3" role="note">
            <strong>{CLEANING_WARRANTY_NOTE}.</strong> Check the issue above. You decide edge cases, for example a dirty evaporator coil the customer did not ask to be cleaned.
          </div>
        )}

        {backJob.originalReportPreExistingIssue?.flagged && (
          <div className="refund-flag-notice admin-back-jobs-x3">
            <strong>Technician flagged a pre-existing issue at time of original service:</strong>
            <div className="admin-back-jobs-x5">"{backJob.originalReportPreExistingIssue.description}"</div>
          </div>
        )}

        {backJob.status === BACK_JOB_STATUS.SCHEDULED && (
          <div className="payment-review-cell admin-back-jobs-x6">
            <span className="confirmation-detail-label">Free Repair Visit Scheduled</span>
            <span className="confirmation-detail-value">
              {backJob.resultingBookingId} - {formatDate(backJob.resultingBookingDate)}
            </span>
          </div>
        )}

        {isNotCovered ? (
          <div className="cancel-confirm-actions">
            <button type="button" className="bs-back-btn" onClick={onClose} disabled={submitting}>
              Close
            </button>
            <button type="button" className="bs-next-btn" onClick={handleMarkReviewed} disabled={submitting}>
              {submitting ? 'Saving...' : 'Mark as Reviewed'}
            </button>
          </div>
        ) : (
          <button type="button" className="bs-next-btn admin-back-jobs-x7" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

function BackJobCard({ backJob, onReview }) {
  return (
    <div className="tech-job-card">
      <div className="tech-job-info">
        <div className="tech-job-top-row">
          <small className="tech-job-date-label">{formatDate(backJob.reportedAt)}</small>
          <span className={`tech-job-status-badge ${STATUS_BADGE_CLASS[backJob.status] || ''}`}>
            {backJob.status}
          </span>
        </div>
        <div className="tech-job-service">{backJob.serviceType}</div>
        <small className="tech-job-booking">{backJob.originalBookingId} · {backJob.clientName}</small>
      </div>

      <div className="tech-job-meta">
        <FiInfo /> {backJob.issueDescription}
      </div>

      <div className="tech-job-meta">
        <FiShield /> {backJob.coverageType || 'N/A'}
      </div>

      <button
        className="view-details-btn"
        onClick={() => onReview(backJob)}
      >
        <FiEye size={14} /> {backJob.status === BACK_JOB_STATUS.NOT_COVERED ? 'Review' : 'View'}
      </button>
    </div>
  );
}

function BackJobs() {
  // The "Needs attention" panel links here with ?filter=Not Covered.
  const [linkParams] = useSearchParams();
  const linkedFilter = linkParams.get('filter');
  const [activeFilter, setActiveFilter] = useState(FILTERS.some((f) => f.key === linkedFilter) ? linkedFilter : 'all');
  const [search, setSearch] = useState('');
  const [selectedBackJob, setSelectedBackJob] = useState(null);
  const [rawBackJobs, setRawBackJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBackJobs = async () => {
    setLoading(true);
    try {
      const data = await listBackJobs();
      setRawBackJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching back jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackJobs();
  }, []);

  const backJobsList = useMemo(() => {
    return rawBackJobs
      .map((bj) => ({
        id: bj._id,
        backJobId: bj.backJobId,
        clientName: customerLabel(bj.customer, 'Customer'),
        originalBookingId: bj.originalBookingId,
        serviceType: bj.originalBooking?.service?.name || 'Service',
        issueDescription: bj.issueDescription,
        status: bj.status,
        coverageType: bj.warrantyCheck?.coverageType,
        warranty: bj.warranty,
        resultingBookingId: bj.resultingBookingId,
        resultingBookingDate: bj.resultingBooking?.date,
        reportedAt: bj.reportedAt,
        originalReportPreExistingIssue: bj.originalReportPreExistingIssue,
      }))
      .sort((a, b) => new Date(b.reportedAt || 0) - new Date(a.reportedAt || 0));
  }, [rawBackJobs]);

  const filteredBackJobs = useMemo(() => {
    return backJobsList.filter((bj) => {
      const matchesFilter = activeFilter === 'all' || bj.status === activeFilter;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        bj.clientName.toLowerCase().includes(query) ||
        bj.originalBookingId.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [backJobsList, activeFilter, search]);

  const handleReview = (backJob) => {
    setSelectedBackJob(backJob);
  };

  return (
    <AdminLayout
      title="Back Jobs"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name, booking id..."
    >
      <h1 className="dashboard-welcome">Back Jobs</h1>
      <div className="backjobs-toolbar">
        <div className="backjobs-filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${activeFilter === filter.key ? 'filter-pill--active' : ''}`}
              style={getFilterPillStyle(filter.key, activeFilter === filter.key)}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="backjobs-empty">Loading back job reports...</div>
      ) : (
        <div className="tech-job-list">
          {filteredBackJobs.length === 0 ? (
            <div className="backjobs-empty">No back job reports match your search.</div>
          ) : (
            filteredBackJobs.map((backJob) => (
              <BackJobCard key={backJob.id} backJob={backJob} onReview={handleReview} />
            ))
          )}
        </div>
      )}

      {selectedBackJob && (
        <BackJobDetailModal
          backJob={selectedBackJob}
          onClose={() => setSelectedBackJob(null)}
          onSuccess={fetchBackJobs}
        />
      )}
    </AdminLayout>
  );
}

export default BackJobs;
