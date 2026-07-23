import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from './admin_layout';
import { FiClock, FiFileText, FiUser, FiMapPin, FiSearch, FiX, FiEye, FiCheckCircle, FiAlertCircle, FiClock as FiClockIcon } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

// Filter options
const FILTERS = [
  { key: 'all', label: 'All Reports' },
  { key: 'Complete', label: 'Complete' },
  { key: 'Partial', label: 'Partial' },
  { key: 'Unresolved', label: 'Unresolved' },
];

// Resolution status styles
const RESOLUTION_META = {
  Complete: { label: 'Complete', className: 'resolution-badge resolution-badge--complete' },
  Partial: { label: 'Partial', className: 'resolution-badge resolution-badge--partial' },
  Unresolved: { label: 'Unresolved', className: 'resolution-badge resolution-badge--unresolved' },
};

function ResolutionBadge({ resolution }) {
  const meta = RESOLUTION_META[resolution];
  if (!meta) return null;
  return <span className={meta.className}>{meta.label}</span>;
}

// Icons
function ClockIcon() {
  return <FiClock className="icon-clock" aria-hidden="true" />;
}

function FileIcon() {
  return <FiFileText className="icon-file" aria-hidden="true" />;
}

function UserIcon() {
  return <FiUser className="icon-user" aria-hidden="true" />;
}

function MapPinIcon() {
  return <FiMapPin className="icon-map" aria-hidden="true" />;
}

function EyeIcon() {
  return <FiEye className="icon-eye" aria-hidden="true" />;
}

function CloseIcon() {
  return <FiX className="icon-close" aria-hidden="true" />;
}

function SearchIcon() {
  return <FiSearch className="icon-search" aria-hidden="true" />;
}

function CheckIcon() {
  return <FiCheckCircle className="icon-check" aria-hidden="true" />;
}

function AlertIcon() {
  return <FiAlertCircle className="icon-alert" aria-hidden="true" />;
}

/* ── View Report Modal ──────────────────────────────── */
function ViewReportModal({ report, onClose }) {
  if (!report) return null;

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card report-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Service Report Details</h4>
          <button className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Booking Info */}
        <div className="report-view-booking-info">
          <div className="report-view-booking-header">
            <p className="report-view-booking-id">{report.bookingId}</p>
            <ResolutionBadge resolution={report.issueResolution} />
          </div>
          
          {/* Customer & Location Info */}
          <div className="report-view-customer-info">
            {report.bookingDetails?.customer && (
              <div className="report-view-info-item">
                <UserIcon />
                <span>{report.bookingDetails.customer.name || 'N/A'}</span>
              </div>
            )}
            {report.bookingDetails?.address && (
              <div className="report-view-info-item">
                <MapPinIcon />
                <span>{report.bookingDetails.address}</span>
              </div>
            )}
            {report.bookingDetails?.date && (
              <div className="report-view-info-item">
                <ClockIcon />
                <span>{formatDate(report.bookingDetails.date)} {report.bookingDetails.time || ''}</span>
              </div>
            )}
          </div>
        </div>

        <div className="report-view-grid">
          {/* Work Summary - Full Width */}
          <div className="report-view-field report-view-field--full">
            <label className="report-view-label">
              <FileIcon /> Work Summary
            </label>
            <p className="report-view-value report-view-value--summary">{report.workSummary}</p>
          </div>

          {/* Technician */}
          <div className="report-view-field">
            <label className="report-view-label">
              <UserIcon /> Technician
            </label>
            <p className="report-view-value">{report.technician?.name || 'N/A'}</p>
          </div>

          {/* Labor Hours */}
          <div className="report-view-field">
            <label className="report-view-label">
              <ClockIcon /> Labor Hours
            </label>
            <p className="report-view-value">{report.laborHours ? `${report.laborHours} hrs` : 'N/A'}</p>
          </div>

          {/* Parts Used - Full Width if present */}
          {report.partsUsed && (
            <div className="report-view-field report-view-field--full">
              <label className="report-view-label">
                <FiFileText /> Parts Used
              </label>
              <p className="report-view-value report-view-value--parts">{report.partsUsed}</p>
            </div>
          )}

          {/* Follow-up Required - Full Width */}
          <div className="report-view-field report-view-field--full">
            <label className="report-view-label">
              {report.followUpRequired ? <AlertIcon /> : <CheckIcon />} Follow-up Required
            </label>
            <p className="report-view-value">
              {report.followUpRequired ? (
                <span className="report-view-followup-yes">
                  Yes - Follow-up on {formatDate(report.followUpDate)}
                </span>
              ) : (
                <span className="report-view-followup-no">No follow-up needed</span>
              )}
            </p>
          </div>

          {/* Recommendations - Full Width */}
          {report.recommendations && (
            <div className="report-view-field report-view-field--full">
              <label className="report-view-label">
                <FiFileText /> Recommendations
              </label>
              <p className="report-view-value report-view-value--rec">{report.recommendations}</p>
            </div>
          )}

          {/* Additional Notes - Full Width */}
          {report.notes && (
            <div className="report-view-field report-view-field--full">
              <label className="report-view-label">
                <FiFileText /> Additional Notes
              </label>
              <p className="report-view-value report-view-value--notes">{report.notes}</p>
            </div>
          )}

          {/* Submitted Info - Full Width */}
          <div className="report-view-field report-view-field--full report-view-field--submitted">
            <div className="report-view-submitted-info">
              <div>
                <label className="report-view-label">Submitted On</label>
                <p className="report-view-value">{formatDateTime(report.submittedAt)}</p>
              </div>
              {report.bookingDetails?.completedAt && (
                <div>
                  <label className="report-view-label">Completed On</label>
                  <p className="report-view-value">{formatDateTime(report.bookingDetails.completedAt)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          className="report-view-close-btn"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ── Report Card ──────────────────────────────── */
function ReportCard({ report, onViewReport }) {
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="report-card">
      <div className="report-card__main">
        <div className="report-card__header">
          <span className="report-card__booking-id">{report.bookingId}</span>
          <ResolutionBadge resolution={report.issueResolution} />
        </div>
        <div className="report-card__service">
          <span className="report-card__service-type">{report.bookingDetails?.service?.name || 'Service'}</span>
          <span className="report-card__dot">·</span>
          <span className="report-card__detail">{report.bookingDetails?.brandModel || 'N/A'}</span>
        </div>
        <div className="report-card__customer">
          <UserIcon />
          <span>{report.bookingDetails?.customer?.name || 'N/A'}</span>
        </div>
        <div className="report-card__technician">
          <span className="report-card__tech-label">Technician:</span>
          <span>{report.technician?.name || 'N/A'}</span>
        </div>
        <div className="report-card__summary">
          <FileIcon />
          <span className="report-card__summary-text">
            {report.workSummary?.length > 60 
              ? `${report.workSummary.substring(0, 60)}...` 
              : report.workSummary}
          </span>
        </div>
      </div>

      <div className="report-card__meta">
        <div className="report-card__date">
          <ClockIcon />
          <span>Submitted: {formatDate(report.submittedAt)}</span>
        </div>
        {report.laborHours && (
          <div className="report-card__hours">
            <span>⏱ {report.laborHours} hrs</span>
          </div>
        )}
        {report.followUpRequired && (
          <div className="report-card__followup">
            <AlertIcon />
            <span>Follow-up required</span>
          </div>
        )}
      </div>

      <div className="report-card__action">
        <button
          type="button"
          className="report-card__view-btn"
          onClick={() => onViewReport(report)}
        >
          <EyeIcon />
          View Report
        </button>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────── */
function ServiceReports() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all reports
  const fetchReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  // Apply Search & Filter
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesFilter =
        activeFilter === 'all' ||
        report.issueResolution === activeFilter;

      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        report.bookingId?.toLowerCase().includes(query) ||
        report.workSummary?.toLowerCase().includes(query) ||
        report.technician?.name?.toLowerCase().includes(query) ||
        report.bookingDetails?.customer?.name?.toLowerCase().includes(query) ||
        report.bookingDetails?.service?.name?.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [reports, activeFilter, search]);

  const handleViewReport = (report) => {
    setSelectedReport(report);
  };

  return (
    <AdminLayout title="Service Reports">
      <div className="reports-toolbar">
        <div className="reports-filters">
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

        <div className="reports-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by booking ID, customer, technician..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="reports-stats">
        <span>Total Reports: <strong>{filteredReports.length}</strong></span>
        {activeFilter !== 'all' && (
          <span className="reports-stats-filter">
            Filtered by: <strong>{activeFilter}</strong>
          </span>
        )}
      </div>

      {loading ? (
        <div className="reports-empty">Loading reports...</div>
      ) : (
        <div className="reports-list">
          {filteredReports.length === 0 ? (
            <div className="reports-empty">No reports match your search.</div>
          ) : (
            filteredReports.map((report) => (
              <ReportCard
                key={report._id}
                report={report}
                onViewReport={handleViewReport}
              />
            ))
          )}
        </div>
      )}

      {selectedReport && (
        <ViewReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </AdminLayout>
  );
}

export default ServiceReports;