import { useState, useEffect } from 'react';
import StaffLayout from './staff_layout';
import { FiClock, FiFileText, FiX, FiUser, FiMapPin } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

function SubmitReportModal({ reportItem, onClose, onSubmit, submitting }) {
  const [form, setForm] = useState({
    workSummary: '',
    partsUsed: '',
    recommendations: '',
    laborHours: '',
    issueResolution: 'Partial',
    followUpRequired: false,
    followUpDate: '',
    notes: '',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === 'checkbox' ? checked : value,
    });
    setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.workSummary.trim()) {
      setError('Please provide a summary of the work done.');
      return;
    }
    if (form.followUpRequired && !form.followUpDate) {
      setError('Please specify a follow-up date if follow-up is required.');
      return;
    }
    onSubmit(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Submit Service Report</h4>
          <button className="modal-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="report-booking-info" style={{ marginBottom: '16px' }}>
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

        <form onSubmit={handleSubmit} className="tech-profile-edit-form" style={{ maxWidth: '100%' }}>
          {/* Work Summary */}
          <div className="form-group">
            <label htmlFor="workSummary" className="tech-stat-label">
              Work Summary <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              id="workSummary"
              name="workSummary"
              className="tech-search-input"
              style={{ minHeight: '80px', resize: 'vertical' }}
              placeholder="Describe the work performed, diagnosis, and actions taken..."
              value={form.workSummary}
              onChange={handleChange}
            />
          </div>

          {/* Labor Hours & Resolution */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label htmlFor="laborHours" className="tech-stat-label">
                Labor Hours <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>(Optional)</span>
              </label>
              <input
                type="number"
                id="laborHours"
                name="laborHours"
                className="tech-search-input"
                placeholder="e.g. 2.5"
                step="0.5"
                min="0"
                max="24"
                value={form.laborHours}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="issueResolution" className="tech-stat-label">
                Resolution
              </label>
              <select
                id="issueResolution"
                name="issueResolution"
                className="tech-search-input"
                value={form.issueResolution}
                onChange={handleChange}
              >
                <option value="Complete">Complete</option>
                <option value="Partial">Partial</option>
                <option value="Unresolved">Unresolved</option>
              </select>
            </div>
          </div>

          {/* Parts Used */}
          <div className="form-group">
            <label htmlFor="partsUsed" className="tech-stat-label">
              Parts Used <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>(Optional)</span>
            </label>
            <input
              type="text"
              id="partsUsed"
              name="partsUsed"
              className="tech-search-input"
              placeholder="e.g. 1x capacitor, refrigerant top-up"
              value={form.partsUsed}
              onChange={handleChange}
            />
          </div>

          {/* Follow-up Checkbox */}
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              id="followUpRequired"
              name="followUpRequired"
              checked={form.followUpRequired}
              onChange={handleChange}
              style={{ accentColor: 'var(--navy)', width: '16px', height: '16px' }}
            />
            <label htmlFor="followUpRequired" className="tech-stat-label" style={{ margin: 0, cursor: 'pointer' }}>
              Follow-up service required
            </label>
          </div>

          {/* Conditional Follow-up Date */}
          {form.followUpRequired && (
            <div className="form-group">
              <label htmlFor="followUpDate" className="tech-stat-label">
                Follow-up Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                id="followUpDate"
                name="followUpDate"
                className="tech-search-input"
                value={form.followUpDate}
                onChange={handleChange}
              />
            </div>
          )}

          {/* Recommendations */}
          <div className="form-group">
            <label htmlFor="recommendations" className="tech-stat-label">
              Recommendations <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>(Optional)</span>
            </label>
            <textarea
              id="recommendations"
              name="recommendations"
              className="tech-search-input"
              style={{ minHeight: '60px', resize: 'vertical' }}
              placeholder="Preventive maintenance tips, safety notes..."
              value={form.recommendations}
              onChange={handleChange}
            />
          </div>

          {/* Additional Notes */}
          <div className="form-group">
            <label htmlFor="notes" className="tech-stat-label">
              Additional Notes <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>(Optional)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              className="tech-search-input"
              style={{ minHeight: '60px', resize: 'vertical' }}
              placeholder="Any other relevant details..."
              value={form.notes}
              onChange={handleChange}
            />
          </div>

          {error && (
            <p style={{ color: '#ef4444', fontSize: '13px', margin: '4px 0 0 0' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              type="button"
              className="tech-sort-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tech-sort-btn"
              style={{ background: 'var(--navy)', color: 'white', borderColor: 'var(--navy)' }}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ViewReportModal({ reportItem, onClose }) {
  const { report } = reportItem;

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

        <div className="report-booking-info" style={{ marginBottom: '16px' }}>
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

        <div className="tech-job-detail-grid" style={{ gap: '14px 16px' }}>
          {/* Work Summary */}
          <div className="tech-job-detail-cell tech-job-detail-full">
            <span className="confirmation-detail-icon"><FiFileText /></span>
            <div>
              <p className="confirmation-detail-label">Work Summary</p>
              <p className="confirmation-detail-value">{report.workSummary}</p>
            </div>
          </div>

          {/* Labor Hours */}
          {report.laborHours && (
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
                  <p className="confirmation-detail-value">Yes Required</p>
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

          {/* Submitted On */}
          <div className="tech-job-detail-cell tech-job-detail-full">
            <span className="confirmation-detail-icon"><FiClock /></span>
            <div>
              <p className="confirmation-detail-label">Submitted On</p>
              <p className="confirmation-detail-value">
                {report.submittedAt ? new Date(report.submittedAt).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        </div>

        <button
          className="tech-sort-btn"
          style={{ width: '100%', marginTop: '16px', justifyContent: 'center' }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function toReportItem(booking, reportData) {
  return {
    _id: booking._id,
    bookingId: booking.bookingId,
    service: booking.service?.name || 'Service',
    customer: booking.customer?.name || 'Customer',
    address: booking.address || 'Address not available',
    bookingDate: booking.date
      ? new Date(booking.date).toLocaleDateString()
      : 'Date not available',
    dueDate: booking.date,
    status: reportData ? 'Completed' : 'Pending',
    report: reportData || null,
  };
}

function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Pending');
  const [activeReport, setActiveReport] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      try {
        // First, get all bookings assigned to the technician
        const bookingsRes = await fetch(`${API_BASE}/api/bookings/technician/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const bookingsData = await bookingsRes.json();
        
        if (!Array.isArray(bookingsData)) {
          setReports([]);
          return;
        }

        // Get completed bookings (status is 'Completed')
        const completedBookings = bookingsData.filter(b => b.status === 'Completed');
        
        // For each completed booking, fetch its report from the reports collection
        const reportPromises = completedBookings.map(async (booking) => {
          try {
            const reportRes = await fetch(`${API_BASE}/api/reports/booking/${booking.bookingId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            
            if (reportRes.ok) {
              const reportData = await reportRes.json();
              return toReportItem(booking, reportData);
            } else {
              // No report found, but booking is completed
              // You might want to handle this case - maybe the report was created differently
              return toReportItem(booking, null);
            }
          } catch (err) {
            console.error(`Error fetching report for booking ${booking.bookingId}:`, err);
            return toReportItem(booking, null);
          }
        });

        const reportItems = await Promise.all(reportPromises);
        setReports(reportItems);
        
      } catch (err) {
        console.error('Failed to load reports', err);
        setReports([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const visibleReports =
    filter === 'All'
      ? reports
      : reports.filter((r) => r.status === filter);

  const handleOpenReport = (reportItem) => {
    setActiveReport(reportItem);
    setModalMode(reportItem.status === 'Pending' ? 'submit' : 'view');
  };

  const handleClose = () => {
    setActiveReport(null);
    setModalMode(null);
  };

  const handleSubmitReport = async (form) => {
    setSubmitting(true);
    const token = localStorage.getItem('token');
    try {
      // Create report in reports collection
      const res = await fetch(
        `${API_BASE}/api/reports`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            bookingId: activeReport.bookingId,
            ...form,
            submittedAt: new Date().toISOString()
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to submit report');

      // Update local state
      setReports((prev) =>
        prev.map((r) =>
          r._id === activeReport._id 
            ? { ...r, status: 'Completed', report: data } 
            : r
        )
      );
      handleClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffLayout title="Reports">
      <div className="report-tabs">
        {['All', 'Pending', 'Completed'].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`report-tab${filter === tab ? ' active' : ''}`}
            onClick={() => setFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="tech-job-list">
        {loading ? (
          <p className="tech-job-empty">Loading reports...</p>
        ) : visibleReports.length === 0 ? (
          <p className="tech-job-empty">No reports in this category.</p>
        ) : (
          visibleReports.map((r, i) => (
            <div className="tech-job-card tech-report-card" key={i}>
              <div className="tech-job-info">
                <div className="tech-job-service">
                  {r.service}{' '}
                  <span
                    className="tech-job-detail-link"
                    onClick={() => handleOpenReport(r)}
                    style={{ cursor: 'pointer' }}
                  >
                    · Detail
                  </span>
                </div>
                <small className="tech-job-booking">{r.bookingId}</small>
                {r.customer && (
                  <small
                    className="tech-job-customer"
                    style={{ display: 'block', marginTop: '4px', color: 'var(--ink-soft)' }}
                  >
                    {r.customer}
                  </small>
                )}
              </div>

              <div className="tech-job-meta">
                <FiClock /> {r.bookingDate}
              </div>

              <button
                className="tech-job-view-link"
                onClick={() => handleOpenReport(r)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <FiFileText />{' '}
                {r.status === 'Pending' ? 'Submit Report' : 'View Report'}
              </button>
            </div>
          ))
        )}
      </div>

      {modalMode === 'submit' && activeReport && (
        <SubmitReportModal
          reportItem={activeReport}
          onClose={handleClose}
          onSubmit={handleSubmitReport}
          submitting={submitting}
        />
      )}

      {modalMode === 'view' && activeReport && (
        <ViewReportModal reportItem={activeReport} onClose={handleClose} />
      )}
    </StaffLayout>
  );
}

export default Reports;