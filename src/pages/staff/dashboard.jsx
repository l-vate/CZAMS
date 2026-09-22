import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from './staff_layout';
import { FiUser, FiTool, FiCheckCircle, FiFileText, FiStar } from 'react-icons/fi';

const API_BASE = `${import.meta.env.VITE_API_URL}`;

function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const firstName = user?.name?.split(' ')[0] || 'Technician';

  const [stats, setStats] = useState({ ongoing: 0, completed: 0, pendingReports: 0, feedbacks: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/bookings/technician/mine/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error('Failed to load stats', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StaffLayout title="Dashboard">
      <div className="tech-dashboard-welcome-row">
        <h1 className="dashboard-welcome">Welcome, {firstName}!</h1>
        <button
          type="button"
          className="tech-dashboard-avatar"
          onClick={() => navigate('/staff/profile')}
          style={{ cursor: 'pointer', border: 'none' }}
          aria-label="Go to profile"
        >
          <FiUser />
        </button>
      </div>

      <div className="tech-stats-grid">
        <div className="tech-stat-card">
          <div className="tech-stat-icon"><FiTool /></div>
          <div>
            <div className="tech-stat-label">Ongoing Jobs</div>
            <div className="tech-stat-value">{loading ? '—' : stats.ongoing}</div>
          </div>
        </div>

        <div className="tech-stat-card">
          <div className="tech-stat-icon"><FiCheckCircle /></div>
          <div>
            <div className="tech-stat-label">Completed Jobs</div>
            <div className="tech-stat-value">{loading ? '—' : stats.completed}</div>
          </div>
        </div>

        <div className="tech-stat-card">
          <div className="tech-stat-icon"><FiFileText /></div>
          <div>
            <div className="tech-stat-label">Pending Reports</div>
            <div className="tech-stat-value">{loading ? '—' : stats.pendingReports}</div>
          </div>
        </div>
      </div>

      <h2 className="tech-section-title">Customer Feedbacks</h2>
      <div className="tech-feedback-list">
        {loading ? (
          <p className="tech-job-empty">Loading feedback...</p>
        ) : stats.feedbacks.length === 0 ? (
          <p className="tech-job-empty">No feedback yet.</p>
        ) : (
          stats.feedbacks.map((f, i) => (
            <div className="tech-feedback-card" key={i}>
              <div className="tech-feedback-left">
                <div className="tech-feedback-avatar"><FiUser /></div>
                <div>
                  <div className="tech-feedback-name">{f.name}</div>
                  <div className="tech-feedback-text">{f.text}</div>
                </div>
              </div>
              <div className="tech-feedback-right">
                <div className="tech-stars">
                  {Array.from({ length: f.rating || 0 }, (_, i) => (
                    <FiStar key={i} fill="currentColor" />
                  ))}
                </div>
                <a href="#" className="tech-view-details-link">View Details</a>
              </div>
            </div>
          ))
        )}
      </div>
    </StaffLayout>
  );
}

export default Dashboard;