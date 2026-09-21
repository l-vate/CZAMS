import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from './admin_layout';
import { FiSearch, FiX } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

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

function SearchIcon() {
  return <FiSearch className="icon-search" aria-hidden="true" />;
}

function CloseIcon() {
  return <FiX aria-hidden="true" />;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Back Job Detail Modal ──────────────────────────────── */
function BackJobDetailModal({ backJob, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!backJob) return null;

  const isNotCovered = backJob.status === 'Not Covered';

  const handleMarkReviewed = async () => {
    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/backjobs/${backJob.backJobId}/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update back job report.');
      }
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
        <div className="modal-header" style={{ marginBottom: '4px' }}>
          <h4 className="modal-title">Back Job Report</h4>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </button>
        </div>

        <p className="payment-review-booking">{backJob.serviceType} · {backJob.originalBookingId}</p>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
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

        <div className="payment-review-cell" style={{ marginBottom: '16px' }}>
          <span className="confirmation-detail-label">Issue Described</span>
          <p className="confirmation-detail-value" style={{ fontWeight: 500 }}>{backJob.issueDescription}</p>
        </div>

        {backJob.originalReportPreExistingIssue?.flagged && (
          <div className="refund-flag-notice" style={{ marginBottom: '16px' }}>
            <strong>Technician flagged a pre-existing issue at time of original service:</strong>
            <div style={{ marginTop: '4px' }}>"{backJob.originalReportPreExistingIssue.description}"</div>
          </div>
        )}

        {backJob.status === 'Scheduled' && (
          <div className="payment-review-cell" style={{ marginBottom: '20px' }}>
            <span className="confirmation-detail-label">Free Repair Visit Scheduled</span>
            <span className="confirmation-detail-value">
              {backJob.resultingBookingId} — {formatDate(backJob.resultingBookingDate)}
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
          <button type="button" className="bs-next-btn" style={{ width: '100%' }} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

function BackJobCard({ backJob, onReview }) {
  return (
    <div className="backjob-card">
      <div className="backjob-card__main">
        <div className="backjob-card__header">
          <span className="backjob-card__client">{backJob.clientName}</span>
          <span className="backjob-card__dot">·</span>
          <StatusBadge status={backJob.status} />
        </div>
        <div className="backjob-card__service">
          <span className="backjob-card__service-type">{backJob.serviceType}</span>
          <span className="backjob-card__dot">·</span>
          <span className="backjob-card__detail">{backJob.originalBookingId}</span>
        </div>
        <p className="backjob-card__issue">{backJob.issueDescription}</p>
      </div>

      <div className="backjob-card__meta">
        <span className="backjob-card__meta-label">Reported</span>
        <span className="backjob-card__meta-value">{formatDate(backJob.reportedAt)}</span>
      </div>

      <div className="backjob-card__action">
        <button type="button" className="backjob-card__review-btn" onClick={() => onReview(backJob)}>
          {backJob.status === 'Not Covered' ? 'Review' : 'View'}
        </button>
      </div>
    </div>
  );
}

function BackJobs() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedBackJob, setSelectedBackJob] = useState(null);
  const [rawBackJobs, setRawBackJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBackJobs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/backjobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch back job reports');
      const data = await res.json();
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
        clientName: bj.customer?.name || 'Customer',
        originalBookingId: bj.originalBookingId,
        serviceType: bj.originalBooking?.service?.name || 'Service',
        issueDescription: bj.issueDescription,
        status: bj.status,
        coverageType: bj.warrantyCheck?.coverageType,
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
    <AdminLayout title="Back Jobs">
      <h1 className="dashboard-welcome">Back Jobs</h1>
      <div className="backjobs-toolbar">
        <div className="backjobs-filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${activeFilter === filter.key ? 'filter-pill--active' : ''}`}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="backjobs-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by name, booking id..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="backjobs-empty">Loading back job reports...</div>
      ) : (
        <div className="backjobs-list">
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
