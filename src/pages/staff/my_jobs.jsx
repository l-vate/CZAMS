import { useState, useMemo, useRef, useEffect } from 'react';
import StaffLayout from './staff_layout';
import {
  FiChevronDown, FiSearch, FiClock, FiMapPin, FiX, FiInfo, FiUser, FiPhone,
} from 'react-icons/fi';
import { getUnitsSummary } from '../../utils/bookingPricing';

const API_BASE = 'http://localhost:5000';

const statusClass = {
  'Pending': 'tech-status-pending',
  'Approved': 'tech-status-confirmed',
  'In Progress': 'tech-status-in-progress',
  'Completed': 'tech-status-completed',
  'Cancelled': 'tech-status-cancelled',
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

function parseJobDate(dateStr) {
  if (!dateStr) return new Date(0);
  // handles "07-08-26" (mm-dd-yy) or an ISO date string
  if (dateStr.includes('-') && dateStr.length <= 8) {
    const [mm, dd, yy] = dateStr.split('-').map(Number);
    return new Date(2000 + yy, mm - 1, dd);
  }
  return new Date(dateStr);
}

function JobDetailsModal({ job, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Job Details</h4>
          <button className="modal-close-btn" onClick={onClose}><FiX /></button>
        </div>

        <div className="tech-job-detail-top">
          <span className="tech-job-detail-service">{job.service}</span>
          <span className={`tech-job-status-badge ${statusClass[job.status] || ''}`}>{job.status}</span>
        </div>
        <p className="tech-job-detail-booking">Booking ID: {job.bookingId}</p>

        <div className="tech-job-detail-grid">
          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiClock /></span>
            <div>
              <p className="confirmation-detail-label">Date &amp; Time</p>
              <p className="confirmation-detail-value">{job.date}, {job.time}</p>
            </div>
          </div>

          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiMapPin /></span>
            <div>
              <p className="confirmation-detail-label">Address</p>
              <p className="confirmation-detail-value">{job.address}</p>
            </div>
          </div>

          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiUser /></span>
            <div>
              <p className="confirmation-detail-label">Customer</p>
              <p className="confirmation-detail-value">{job.customerName}</p>
            </div>
          </div>

          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiPhone /></span>
            <div>
              <p className="confirmation-detail-label">Contact Number</p>
              <p className="confirmation-detail-value">{job.contactNumber || '—'}</p>
            </div>
          </div>

          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiInfo /></span>
            <div>
              <p className="confirmation-detail-label">Unit Type</p>
              <p className="confirmation-detail-value">{job.unitType || '—'}</p>
            </div>
          </div>
        </div>

        <div className="tech-job-detail-cell tech-job-detail-full">
          <span className="confirmation-detail-icon"><FiInfo /></span>
          <div>
            <p className="confirmation-detail-label">Problem Description</p>
            <p className="confirmation-detail-value">{job.problemDescription || '—'}</p>
          </div>
        </div>

        {job.technicianInstructions && (
          <div className="tech-job-detail-cell tech-job-detail-full" style={{ background: '#fff8ec', borderColor: '#f3c98b' }}>
            <span className="confirmation-detail-icon"><FiInfo /></span>
            <div>
              <p className="confirmation-detail-label">Instructions from Admin</p>
              <p className="confirmation-detail-value">{job.technicianInstructions}</p>
            </div>
          </div>
        )}

        <button className="bs-back-btn" style={{ width: '100%', marginTop: '4px' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

const DISRUPTION_EXTENSION_COPY = {
  disruption: {
    title: 'Report a Disruption',
    description: "Let admin know this job was interrupted or is running longer than scheduled. Admin will review and reschedule it.",
    placeholder: "e.g. Unit needed a part we didn't have on hand...",
    statusText: {
      Reported: 'Reported — waiting for admin to reschedule this job.',
      Rescheduled: 'Resolved — this job has been rescheduled.',
    },
  },
  extension: {
    title: 'Request an Extension',
    description: "Ask admin for an extra day to finish this job. This isn't automatic — admin has to approve it first.",
    placeholder: 'e.g. Job is more complex than expected, need one more day...',
    statusText: {
      Pending: 'Pending — waiting for admin approval.',
      Approved: 'Approved — you have the extra day.',
      Denied: 'Not approved.',
    },
  },
};

function DisruptionExtensionModal({ kind, job, onClose, onSubmit, submitting }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const copy = DISRUPTION_EXTENSION_COPY[kind];
  const record = kind === 'disruption' ? job.disruption : job.extensionRequest;
  const status = record?.status || 'None';
  const isResolved = status !== 'None';

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setError('');
    onSubmit(reason.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">{copy.title}</h4>
          <button className="modal-close-btn" onClick={onClose}><FiX /></button>
        </div>

        {isResolved ? (
          <>
            <p className="modal-instruction">{copy.statusText[status]}</p>
            <p className="cancel-confirm-text">"{record.reason}"</p>
            <button className="bs-back-btn" style={{ width: '100%', marginTop: '10px' }} onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <p className="modal-instruction">{copy.description}</p>
            <div className="bs-field-group">
              <label className="bs-label">Details</label>
              <textarea
                className="bs-textarea"
                rows={4}
                placeholder={copy.placeholder}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error && (
              <p style={{ fontSize: '12px', color: '#e05a5a', marginTop: '-8px', marginBottom: '12px' }}>{error}</p>
            )}
            <button className="modal-submit-btn" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function disruptionLabel(job) {
  const status = job.disruption?.status || 'None';
  if (status === 'None') return 'Report Disruption';
  if (status === 'Reported') return 'Disruption Reported';
  return 'Disruption Resolved';
}

function extensionLabel(job) {
  const status = job.extensionRequest?.status || 'None';
  if (status === 'None') return 'Request Extension';
  if (status === 'Pending') return 'Extension Pending';
  if (status === 'Approved') return 'Extension Approved';
  return 'Extension Denied';
}

function toViewJob(booking) {
  return {
    date: booking.date,
    status: booking.status,
    bookingId: booking.bookingId,
    service: booking.service?.name || 'Service',
    address: booking.address,
    time: booking.time,
    customerName: booking.customer?.name || 'Customer',
    contactNumber: booking.customer?.phone || '',
    unitType: getUnitsSummary(booking, { withBrand: true }),
    problemDescription: booking.problemDescription,
    technicianInstructions: booking.technicianInstructions,
    disruption: booking.disruption,
    extensionRequest: booking.extensionRequest,
  };
}

function MyJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [reportModal, setReportModal] = useState(null); // { kind: 'disruption' | 'extension', job }
  const [submittingReport, setSubmittingReport] = useState(false);
  const sortWrapperRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/bookings/technician/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setJobs(Array.isArray(data) ? data.map(toViewJob) : []))
      .catch((err) => console.error('Failed to load jobs', err))
      .finally(() => setLoading(false));
  }, []);

  const handleViewDetails = (job) => setSelectedJob(job);
  const handleCloseDetails = () => setSelectedJob(null);
  const handleSelectSort = (value) => { setSortBy(value); setShowSortMenu(false); };

  const handleSubmitReport = async (reasonText) => {
    if (!reportModal) return;
    setSubmittingReport(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint = reportModal.kind === 'disruption'
        ? `${API_BASE}/api/bookings/${reportModal.job.bookingId}/disruption/report`
        : `${API_BASE}/api/bookings/${reportModal.job.bookingId}/extension/request`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reasonText }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to submit.');
        return;
      }
      const updatedJob = toViewJob(data);
      setJobs((prev) => prev.map((j) => (j.bookingId === updatedJob.bookingId ? updatedJob : j)));
      setReportModal({ kind: reportModal.kind, job: updatedJob });
    } catch (err) {
      alert('Could not connect to server.');
    } finally {
      setSubmittingReport(false);
    }
  };

  useEffect(() => {
    if (!showSortMenu) return;
    const handleClickOutside = (event) => {
      if (sortWrapperRef.current && !sortWrapperRef.current.contains(event.target)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortMenu]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  const visibleJobs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = term
      ? jobs.filter(
          (job) =>
            job.service?.toLowerCase().includes(term) ||
            job.bookingId?.toLowerCase().includes(term) ||
            job.address?.toLowerCase().includes(term) ||
            job.customerName?.toLowerCase().includes(term) ||
            job.status?.toLowerCase().includes(term)
        )
      : jobs;

    return [...filtered].sort((a, b) => {
      const diff = parseJobDate(a.date).getTime() - parseJobDate(b.date).getTime();
      return sortBy === 'newest' ? -diff : diff;
    });
  }, [jobs, searchTerm, sortBy]);

  return (
    <StaffLayout title="My Jobs">
      <div className="tech-jobs-toolbar">
        <div className="tech-sort-wrapper" ref={sortWrapperRef}>
          <button className="tech-sort-btn" type="button" onClick={() => setShowSortMenu((prev) => !prev)}>
            {currentSortLabel}
            <FiChevronDown style={{ transition: 'transform 0.15s ease', transform: showSortMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>
          {showSortMenu && (
            <div className="tech-sort-menu">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`tech-sort-menu-item ${sortBy === opt.value ? 'active' : ''}`}
                  onClick={() => handleSelectSort(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="tech-search-wrapper">
          <FiSearch className="tech-search-icon" />
          <input
            className="tech-search-input"
            type="text"
            placeholder="Search by service, booking ID, customer, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="tech-job-list">
        {loading ? (
          <p className="tech-job-empty">Loading jobs...</p>
        ) : visibleJobs.length === 0 ? (
          <p className="tech-job-empty">No jobs match your search.</p>
        ) : (
          visibleJobs.map((job) => (
            <div className="tech-job-card" key={job.bookingId}>
              <div className="tech-job-info">
                <div className="tech-job-top-row">
                  <small className="tech-job-date-label">{job.date}</small>
                  <span className={`tech-job-status-badge ${statusClass[job.status] || ''}`}>{job.status}</span>
                </div>
                <div className="tech-job-service">
                  {job.service}{' '}
                  <span className="tech-job-detail-link" onClick={() => handleViewDetails(job)} style={{ cursor: 'pointer' }}>
                    · Detail
                  </span>
                </div>
                <small className="tech-job-booking">{job.bookingId}</small>
              </div>

              <div className="tech-job-meta"><FiClock /> {job.time}</div>
              <div className="tech-job-meta"><FiMapPin /> {job.address}</div>

              <button
                className="tech-job-view-link"
                onClick={() => handleViewDetails(job)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <FiClock /> View Details
              </button>

              {job.status === 'In Progress' && (
                <>
                  <button
                    className="tech-job-view-link"
                    onClick={() => setReportModal({ kind: 'disruption', job })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <FiInfo /> {disruptionLabel(job)}
                  </button>
                  <button
                    className="tech-job-view-link"
                    onClick={() => setReportModal({ kind: 'extension', job })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <FiInfo /> {extensionLabel(job)}
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {selectedJob && <JobDetailsModal job={selectedJob} onClose={handleCloseDetails} />}

      {reportModal && (
        <DisruptionExtensionModal
          kind={reportModal.kind}
          job={reportModal.job}
          onClose={() => setReportModal(null)}
          onSubmit={handleSubmitReport}
          submitting={submittingReport}
        />
      )}
    </StaffLayout>
  );
}

export default MyJobs;