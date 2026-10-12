import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import StaffLayout from './staff_layout';
import {
  FiChevronDown, FiSearch, FiClock, FiMapPin, FiX, FiInfo, FiUser, FiPhone, FiEye,
} from 'react-icons/fi';
import { getUnitsSummary } from '../../utils/bookingPricing';
import { getFilterPillStyle } from '../../utils/statusColors';
import { ApiError } from '../../services/apiClient';
import LoadError from '../../components/load_error';
import { listTechnicianJobs, reportDisruption, requestExtension } from '../../services/bookingService';
import { getAssignedNames } from '../../utils/assignments';
import AssignmentHistory from '../../components/assignment_history';
import { JOB_SORT, JOB_SORT_OPTIONS, sortJobs } from '../../utils/jobSort';
import { BOOKING_STATUS, BOOKING_STATUS_VALUES } from '../../constants/bookingStatus';


const statusClass = {
  'Pending': 'tech-status-pending',
  'Approved': 'tech-status-confirmed',
  'In Progress': 'tech-status-in-progress',
  'Completed': 'tech-status-completed',
  'Cancelled': 'tech-status-cancelled',
};

// Same filter set/order as the customer side's My Bookings (customer/my_bookings.jsx).
const FILTERS = ['All', ...BOOKING_STATUS_VALUES];

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
        <p className="tech-job-detail-booking">Your role: <strong>{job.myRole}</strong>{job.assigned ? ` · Assigned: ${job.assigned}` : ''}</p>
        {job.myRole === 'Helper' && (
          <p className="tech-job-detail-booking">You are the helper on this job, so it is read-only for you. The lead technician reports disruptions, asks for extensions and submits the service report.</p>
        )}

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
              <p className="confirmation-detail-value">{job.contactNumber || '-'}</p>
            </div>
          </div>

          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiInfo /></span>
            <div>
              <p className="confirmation-detail-label">Unit Type</p>
              <p className="confirmation-detail-value">{job.unitType || '-'}</p>
            </div>
          </div>
        </div>

        <div className="tech-job-detail-cell tech-job-detail-full">
          <span className="confirmation-detail-icon"><FiInfo /></span>
          <div>
            <p className="confirmation-detail-label">Problem Description</p>
            <p className="confirmation-detail-value">{job.problemDescription || '-'}</p>
          </div>
        </div>

        {job.technicianInstructions && (
          <div className="tech-job-detail-cell tech-job-detail-full staff-my-jobs-x1">
            <span className="confirmation-detail-icon"><FiInfo /></span>
            <div>
              <p className="confirmation-detail-label">Instructions from Admin</p>
              <p className="confirmation-detail-value">{job.technicianInstructions}</p>
            </div>
          </div>
        )}

        <AssignmentHistory bookingId={job.bookingId} />

        <button className="bs-back-btn staff-my-jobs-x2" onClick={onClose}>
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
      Reported: 'Reported - waiting for admin to reschedule this job.',
      Rescheduled: 'Resolved - this job has been rescheduled.',
    },
  },
  extension: {
    title: 'Request an Extension',
    description: "Ask admin for an extra day to finish this job. This isn't automatic - admin has to approve it first.",
    placeholder: 'e.g. Job is more complex than expected, need one more day...',
    statusText: {
      Pending: 'Pending - waiting for admin approval.',
      Approved: 'Approved - you have the extra day.',
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
            <button className="bs-back-btn staff-my-jobs-x3" onClick={onClose}>
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
              <p className="staff-my-jobs-x4">{error}</p>
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
    createdAt: booking.createdAt,
    status: booking.status,
    bookingId: booking.bookingId,
    service: booking.service?.name || 'Service',
    address: booking.address,
    time: booking.time,
    customerName: booking.customer?.name || 'Customer',
    contactNumber: booking.contactNumber || booking.customer?.phone || '',
    unitType: getUnitsSummary(booking, { withBrand: true }),
    problemDescription: booking.problemDescription,
    technicianInstructions: booking.technicianInstructions,
    disruption: booking.disruption,
    extensionRequest: booking.extensionRequest,
    // 'Lead' or 'Helper'. Only a lead can report a disruption or ask for an extension.
    myRole: booking.myRole || 'Lead',
    assigned: getAssignedNames(booking, ''),
  };
}

function MyJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [sortBy, setSortBy] = useState(JOB_SORT.NEWEST);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [reportModal, setReportModal] = useState(null); // { kind: 'disruption' | 'extension', job }
  const [submittingReport, setSubmittingReport] = useState(false);
  const sortWrapperRef = useRef(null);

  // A failed load is an error state with a Retry, never "No jobs match your search or filter".
  const loadJobs = () => listTechnicianJobs()
    .then((data) => {
      if (!Array.isArray(data)) throw new Error('Unexpected jobs reply');
      setJobs(data.map(toViewJob));
    })
    .catch((err) => {
      console.error('Failed to load jobs', err);
      setLoadFailed(true);
    })
    .finally(() => setLoading(false));

  const retryLoad = () => {
    setLoadFailed(false);
    setLoading(true);
    loadJobs();
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // A notification links here with ?job=<booking id>: open that job once the list has loaded. If it is
  // not in the list (it was reassigned away, say) say so instead of showing nothing.
  const jobFromLink = searchParams.get('job');
  useEffect(() => {
    if (!jobFromLink || loading || loadFailed) return;
    const job = jobs.find((j) => j.bookingId === jobFromLink);
    setSelectedJob(job || null);
    setNotice(job ? '' : `Job ${jobFromLink} is not on your list any more.`);
    setSearchParams({}, { replace: true });
  }, [jobFromLink, loading, loadFailed, jobs, setSearchParams]);

  useEffect(() => {
    if (!showSortMenu) return;
    const handleClickOutside = (event) => {
      if (sortWrapperRef.current && !sortWrapperRef.current.contains(event.target)) {
        setShowSortMenu(false);
      }
    };
    // eslint-disable-next-line no-restricted-syntax -- outside click: removed in this effect's cleanup
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortMenu]);

  const currentSortLabel = JOB_SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  const visibleJobs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let filtered = term
      ? jobs.filter(
          (job) =>
            job.service?.toLowerCase().includes(term) ||
            job.bookingId?.toLowerCase().includes(term) ||
            job.address?.toLowerCase().includes(term) ||
            job.customerName?.toLowerCase().includes(term) ||
            job.status?.toLowerCase().includes(term)
        )
      : jobs;

    if (activeFilter !== 'All') {
      filtered = filtered.filter((job) => job.status === activeFilter);
    }

    return sortJobs(filtered, sortBy);
  }, [jobs, searchTerm, activeFilter, sortBy]);

  const handleViewDetails = (job) => setSelectedJob(job);

  const handleCloseDetails = () => setSelectedJob(null);

  const handleSelectSort = (value) => { setSortBy(value); setShowSortMenu(false); };

  const handleSubmitReport = async (reasonText) => {
    if (!reportModal) return;
    setSubmittingReport(true);
    try {
      const send = reportModal.kind === 'disruption' ? reportDisruption : requestExtension;
      const data = await send(reportModal.job.bookingId, reasonText);
      // the action response is not per-technician, so keep the role already known for this job
      const updatedJob = { ...toViewJob(data), myRole: reportModal.job.myRole };
      setJobs((prev) => prev.map((j) => (j.bookingId === updatedJob.bookingId ? updatedJob : j)));
      setReportModal({ kind: reportModal.kind, job: updatedJob });
    } catch (err) {
      alert(err instanceof ApiError ? err.message || 'Failed to submit.' : 'Could not connect to server.');
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <StaffLayout title="My Jobs">
      <div className="req-filters">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`filter-pill ${activeFilter === filter ? 'filter-pill--active' : ''}`}
            style={getFilterPillStyle(filter, activeFilter === filter)}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      {notice && <p className="sdm-muted" role="status">{notice}</p>}

      <div className="tech-jobs-toolbar">
        <div className="tech-sort-wrapper" ref={sortWrapperRef}>
          <button className="tech-sort-btn" type="button" onClick={() => setShowSortMenu((prev) => !prev)}>
            {currentSortLabel}
            <FiChevronDown className={`staff-my-jobs-x5 ${showSortMenu ? 'is-open' : ''}`} />
          </button>
          {showSortMenu && (
            <div className="tech-sort-menu">
              {JOB_SORT_OPTIONS.map((opt) => (
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
        ) : loadFailed ? (
          <LoadError message="Could not load your jobs." onRetry={retryLoad} />
        ) : jobs.length === 0 ? (
          <p className="tech-job-empty">You have no jobs yet.</p>
        ) : visibleJobs.length === 0 ? (
          <p className="tech-job-empty">No jobs match your search or filter.</p>
        ) : (
          visibleJobs.map((job) => (
            <div className="tech-job-card" key={job.bookingId}>
              <div className="tech-job-info">
                <div className="tech-job-top-row">
                  <small className="tech-job-date-label">{job.date}</small>
                  <span className={`tech-job-status-badge ${statusClass[job.status] || ''}`}>{job.status}</span>
                  <span className={`tech-job-status-badge ${job.myRole === 'Helper' ? 'tech-role-helper' : 'tech-role-lead'}`}>{job.myRole}</span>
                </div>
                <div className="tech-job-service">{job.service}</div>
                <small className="tech-job-booking">{job.bookingId}</small>
              </div>

              <div className="tech-job-meta"><FiClock /> {job.time}</div>
              <div className="tech-job-meta"><FiMapPin /> {job.address}</div>

              <button
                className="view-details-btn"
                onClick={() => handleViewDetails(job)}
              >
                <FiEye size={14} /> View Details
              </button>

              {job.status === BOOKING_STATUS.IN_PROGRESS && job.myRole === 'Lead' && (
                <>
                  <button
                    className="tech-job-view-link staff-my-jobs-x6"
                    onClick={() => setReportModal({ kind: 'disruption', job })}
                  >
                    <FiInfo /> {disruptionLabel(job)}
                  </button>
                  <button
                    className="tech-job-view-link staff-my-jobs-x6"
                    onClick={() => setReportModal({ kind: 'extension', job })}
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