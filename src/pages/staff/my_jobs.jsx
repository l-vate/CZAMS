import { useState, useMemo, useRef, useEffect } from 'react';
import StaffLayout from './staff_layout';
import {
  FiChevronDown, FiSearch, FiClock, FiMapPin, FiX, FiInfo, FiUser, FiPhone,
} from 'react-icons/fi';

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

        <button className="bs-back-btn" style={{ width: '100%', marginTop: '4px' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
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
    unitType: booking.unitTypes?.join(', '),
    problemDescription: booking.problemDescription,
  };
}

function MyJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
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
            </div>
          ))
        )}
      </div>

      {selectedJob && <JobDetailsModal job={selectedJob} onClose={handleCloseDetails} />}
    </StaffLayout>
  );
}

export default MyJobs;