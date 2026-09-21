import { useState, useEffect } from 'react';
import { buildTechnicianStats } from '../pages/admin/analytics';

const API_BASE = 'http://localhost:5000';

const fmtHours = (h) => (h === null || h === undefined ? 'N/A' : `${h.toFixed(1)} hrs`);

// Manage Accounts' "Performance Review" button — there's no per-technician page to
// navigate into (Analytics is an aggregate dashboard, not a filterable list like
// Bookings/Payments/Reports), so this fetches the same data Analytics does and
// reuses its buildTechnicianStats to show just this one technician's row.
function TechnicianPerformanceModal({ technician, onClose }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [bookingsRes, reportsRes] = await Promise.all([
          fetch(`${API_BASE}/api/bookings`, { headers }),
          fetch(`${API_BASE}/api/reports`, { headers }),
        ]);
        const bookings = bookingsRes.ok ? await bookingsRes.json() : [];
        const reports = reportsRes.ok ? await reportsRes.json() : [];
        if (cancelled) return;
        const all = buildTechnicianStats(bookings, reports);
        setStats(all.find((t) => t.id === technician._id) || {
          id: technician._id, name: technician.name, completedJobs: 0, delays: 0, avgTime: null,
        });
      } catch (err) {
        console.error('Error loading technician performance:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [technician._id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Performance Review</h4>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <p className="ma-form-sub" style={{ marginTop: '-4px' }}>
          {technician.name || 'Technician'} · {technician._id}
        </p>

        {loading ? (
          <p>Loading performance data...</p>
        ) : (
          <div className="tpm-stat-grid">
            <div className="tpm-stat-card">
              <span className="tpm-stat-value">{stats.completedJobs}</span>
              <span className="tpm-stat-label">Completed Jobs</span>
            </div>
            <div className="tpm-stat-card">
              <span className="tpm-stat-value">{fmtHours(stats.avgTime)}</span>
              <span className="tpm-stat-label">Average Service Time</span>
            </div>
            <div className="tpm-stat-card">
              <span className="tpm-stat-value">{stats.delays}</span>
              <span className="tpm-stat-label">Delays</span>
            </div>
          </div>
        )}

        <p className="ma-form-sub" style={{ marginTop: '12px' }}>
          Same figures as this technician's row in Analytics &rarr; Technician Performance Analytics.
        </p>
      </div>
    </div>
  );
}

export default TechnicianPerformanceModal;
