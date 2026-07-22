import { useState, useEffect } from 'react';
import StaffLayout from './staff_layout';
import { FiClock, FiFileText, FiX } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

function SubmitReportModal({ reportItem, onClose, onSubmit, submitting }) {
  const [form, setForm] = useState({ workSummary: '', partsUsed: '', recommendations: '' });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.workSummary.trim()) {
      setError('Please provide a summary of the work done.');
      return;
    }
    onSubmit(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Submit Report</h4>
          <button className="modal-close-btn" onClick={onClose}><FiX /></button>
        </div>

        <p className="tech-job-detail-booking">{reportItem.service} · {reportItem.bookingId}</p>

        <form onSubmit={handleSubmit} className="auth-form" style={{ gap: '14px' }}>
          <div className="form-group">
            <label htmlFor="workSummary">Work Summary</label>
            <textarea
              id="workSummary" name="workSummary" className="bs-textarea" rows={3}
              placeholder="Describe the work performed..."
              value={form.workSummary} onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="partsUsed">Parts Used <span className="bs-label-hint">(Optional)</span></label>
            <input
              type="text" id="partsUsed" name="partsUsed" className="bs-input"
              placeholder="e.g. 1x capacitor, refrigerant top-up"
              value={form.partsUsed} onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="recommendations">Recommendations <span className="bs-label-hint">(Optional)</span></label>
            <textarea
              id="recommendations" name="recommendations" className="bs-textarea" rows={2}
              placeholder="Any follow-up recommendations for the customer..."
              value={form.recommendations} onChange={handleChange}
            />
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{error}</p>}

          <div className="cancel-confirm-actions">
            <button type="button" className="bs-back-btn" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="bs-next-btn" disabled={submitting}>
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
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Service Report</h4>
          <button className="modal-close-btn" onClick={onClose}><FiX /></button>
        </div>

        <p className="tech-job-detail-booking">{reportItem.service} · {reportItem.bookingId}</p>

        <div className="tech-job-detail-cell tech-job-detail-full">
          <span className="confirmation-detail-icon"><FiFileText /></span>
          <div>
            <p className="confirmation-detail-label">Work Summary</p>
            <p className="confirmation-detail-value">{report.workSummary}</p>
          </div>
        </div>

        <div className="tech-job-detail-cell tech-job-detail-full">
          <span className="confirmation-detail-icon"><FiFileText /></span>
          <div>
            <p className="confirmation-detail-label">Parts Used</p>
            <p className="confirmation-detail-value">{report.partsUsed || '—'}</p>
          </div>
        </div>

        <div className="tech-job-detail-cell tech-job-detail-full">
          <span className="confirmation-detail-icon"><FiFileText /></span>
          <div>
            <p className="confirmation-detail-label">Recommendations</p>
            <p className="confirmation-detail-value">{report.recommendations || '—'}</p>
          </div>
        </div>

        <div className="tech-job-detail-cell tech-job-detail-full">
          <span className="confirmation-detail-icon"><FiClock /></span>
          <div>
            <p className="confirmation-detail-label">Submitted On</p>
            <p className="confirmation-detail-value">
              {report.submittedAt ? new Date(report.submittedAt).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>

        <button className="bs-back-btn" style={{ width: '100%', marginTop: '4px' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function toReportItem(booking) {
  return {
    _id: booking._id,
    bookingId: booking.bookingId,
    service: booking.service?.name || 'Service',
    dueDate: booking.date,
    status: booking.report?.submittedAt ? 'Completed' : 'Pending',
    report: booking.report?.submittedAt ? booking.report : null,
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
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/bookings/technician/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const completedJobs = Array.isArray(data)
          ? data.filter((b) => b.status === 'Completed' || b.report?.submittedAt)
          : [];
        setReports(completedJobs.map(toReportItem));
      })
      .catch((err) => console.error('Failed to load reports', err))
      .finally(() => setLoading(false));
  }, []);

  const visibleReports = filter === 'All' ? reports : reports.filter((r) => r.status === filter);

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
      const res = await fetch(`${API_BASE}/api/bookings/${activeReport.bookingId}/report`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to submit report');

      setReports((prev) =>
        prev.map((r) => (r._id === activeReport._id ? toReportItem(data) : r))
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
                  <span className="tech-job-detail-link" onClick={() => handleOpenReport(r)} style={{ cursor: 'pointer' }}>
                    · Detail
                  </span>
                </div>
                <small className="tech-job-booking">{r.bookingId}</small>
              </div>

              <div className="tech-job-meta"><FiClock /> Complete on {r.dueDate}</div>

              <button
                className="tech-job-view-link"
                onClick={() => handleOpenReport(r)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <FiFileText /> {r.status === 'Pending' ? 'Submit Report' : 'View Report'}
              </button>
            </div>
          ))
        )}
      </div>

      {modalMode === 'submit' && activeReport && (
        <SubmitReportModal reportItem={activeReport} onClose={handleClose} onSubmit={handleSubmitReport} submitting={submitting} />
      )}

      {modalMode === 'view' && activeReport && (
        <ViewReportModal reportItem={activeReport} onClose={handleClose} />
      )}
    </StaffLayout>
  );
}

export default Reports;