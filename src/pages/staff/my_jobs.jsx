import { useState, useMemo } from 'react';
import StaffLayout from './staff_layout';
import {
  FiChevronDown,
  FiSearch,
  FiClock,
  FiMapPin,
  FiX,
  FiInfo,
  FiUser,
  FiPhone,
} from 'react-icons/fi';

const jobs = [
  {
    date: '07-08-26',
    status: 'In Progress',
    bookingId: 'CZ-2026-7402',
    service: 'AIRCON REPAIR',
    address: 'Tagum City',
    time: '9:00 AM – 11:00 AM',
    customerName: 'Pedro Santos',
    contactNumber: '09998887777',
    unitType: 'Split Type',
    problemDescription: 'Unit not cooling, makes rattling noise.',
  },
  {
    date: '07-06-26',
    status: 'Completed',
    bookingId: 'CZ-2026-7395',
    service: 'AIRCON CLEANING',
    address: 'San Fernando, Pampanga',
    time: '1:00 PM – 2:30 PM',
    customerName: 'Juan Dela Cruz',
    contactNumber: '09123456789',
    unitType: 'Window Type',
    problemDescription: 'Routine deep cleaning requested.',
  },
  {
    date: '07-04-26',
    status: 'Completed',
    bookingId: 'CZ-2026-7381',
    service: 'PREVENTIVE MAINTENANCE',
    address: 'Panabo City',
    time: '10:00 AM – 11:00 AM',
    customerName: 'Maria Reyes',
    contactNumber: '09171234567',
    unitType: 'Cassette Type',
    problemDescription: 'Scheduled quarterly check-up.',
  },
];

const statusClass = {
  'In Progress': 'tech-status-in-progress',
  Completed: 'tech-status-completed',
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

/* ── Helper: parse mm-dd-yy into a real Date for sorting ── */
function parseJobDate(dateStr) {
  const [mm, dd, yy] = dateStr.split('-').map(Number);
  return new Date(2000 + yy, mm - 1, dd);
}

/* ── Job Details Modal ─────────────────────────────────── */
function JobDetailsModal({ job, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Job Details</h4>
          <button className="modal-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="tech-job-detail-top">
          <span className="tech-job-detail-service">{job.service}</span>
          <span className={`tech-job-status-badge ${statusClass[job.status]}`}>
            {job.status}
          </span>
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
              <p className="confirmation-detail-value">{job.contactNumber}</p>
            </div>
          </div>

          <div className="tech-job-detail-cell">
            <span className="confirmation-detail-icon"><FiInfo /></span>
            <div>
              <p className="confirmation-detail-label">Unit Type</p>
              <p className="confirmation-detail-value">{job.unitType}</p>
            </div>
          </div>
        </div>

        <div className="tech-job-detail-cell tech-job-detail-full">
          <span className="confirmation-detail-icon"><FiInfo /></span>
          <div>
            <p className="confirmation-detail-label">Problem Description</p>
            <p className="confirmation-detail-value">{job.problemDescription}</p>
          </div>
        </div>

        <button className="bs-back-btn" style={{ width: '100%', marginTop: '4px' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function MyJobs() {
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const handleViewDetails = (job) => setSelectedJob(job);
  const handleCloseDetails = () => setSelectedJob(null);

  const handleSelectSort = (value) => {
    setSortBy(value);
    setShowSortMenu(false);
  };

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  const visibleJobs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = term
      ? jobs.filter(
          (job) =>
            job.service.toLowerCase().includes(term) ||
            job.bookingId.toLowerCase().includes(term) ||
            job.address.toLowerCase().includes(term) ||
            job.customerName.toLowerCase().includes(term) ||
            job.status.toLowerCase().includes(term)
        )
      : jobs;

    const sorted = [...filtered].sort((a, b) => {
      const diff = parseJobDate(a.date) - parseJobDate(b.date);
      return sortBy === 'newest' ? -diff : diff;
    });

    return sorted;
  }, [searchTerm, sortBy]);

  return (
    <StaffLayout title="My Jobs">
      <div className="tech-jobs-toolbar">
        <div className="tech-sort-wrapper">
          <button
            className="tech-sort-btn"
            type="button"
            onClick={() => setShowSortMenu((prev) => !prev)}
          >
            {currentSortLabel} <FiChevronDown />
          </button>

          {showSortMenu && (
            <div className="tech-sort-menu">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
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
        {visibleJobs.length === 0 ? (
          <p className="tech-job-empty">No jobs match your search.</p>
        ) : (
          visibleJobs.map((job, i) => (
            <div className="tech-job-card" key={i}>
              <div className="tech-job-info">
                <div className="tech-job-top-row">
                  <small className="tech-job-date-label">{job.date}</small>
                  <span className={`tech-job-status-badge ${statusClass[job.status]}`}>
                    {job.status}
                  </span>
                </div>

                <div className="tech-job-service">
                  {job.service}{' '}
                  <span
                    className="tech-job-detail-link"
                    onClick={() => handleViewDetails(job)}
                    style={{ cursor: 'pointer' }}
                  >
                    · Detail
                  </span>
                </div>
                <small className="tech-job-booking">{job.bookingId}</small>
              </div>

              <div className="tech-job-meta">
                <FiClock /> {job.time}
              </div>

              <div className="tech-job-meta">
                <FiMapPin /> {job.address}
              </div>

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

      {selectedJob && (
        <JobDetailsModal job={selectedJob} onClose={handleCloseDetails} />
      )}
    </StaffLayout>
  );
}

export default MyJobs;