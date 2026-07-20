import { useNavigate } from 'react-router-dom';
import StaffLayout from './staff_layout';
import { FiUser, FiTool, FiCheckCircle, FiFileText, FiStar } from 'react-icons/fi';

const feedbacks = [
  { name: 'Jereign', text: 'Amazing work!', rating: 5 },
  { name: 'Gracy', text: 'Super clean and fast service, woohoo!', rating: 5 },
  { name: 'Charlz', text: 'Great job, very professional.', rating: 5 },
];

function Dashboard() {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('user'));
  const firstName = user?.name?.split(' ')[0] || 'Technician';

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
          <div className="tech-stat-icon">
            <FiTool />
          </div>
          <div>
            <div className="tech-stat-label">Ongoing Jobs</div>
            <div className="tech-stat-value">0</div>
          </div>
        </div>

        <div className="tech-stat-card">
          <div className="tech-stat-icon">
            <FiCheckCircle />
          </div>
          <div>
            <div className="tech-stat-label">Completed Jobs</div>
            <div className="tech-stat-value">0</div>
          </div>
        </div>

        <div className="tech-stat-card">
          <div className="tech-stat-icon">
            <FiFileText />
          </div>
          <div>
            <div className="tech-stat-label">Pending Reports</div>
            <div className="tech-stat-value">0</div>
          </div>
        </div>
      </div>

      <h2 className="tech-section-title">Customer Feedbacks</h2>
      <div className="tech-feedback-list">
        {feedbacks.map((f) => (
          <div className="tech-feedback-card" key={f.name}>
            <div className="tech-feedback-left">
              <div className="tech-feedback-avatar">
                <FiUser />
              </div>
              <div>
                <div className="tech-feedback-name">{f.name}</div>
                <div className="tech-feedback-text">{f.text}</div>
              </div>
            </div>
            <div className="tech-feedback-right">
              <div className="tech-stars">
                {Array.from({ length: f.rating }, (_, i) => (
                  <FiStar key={i} fill="currentColor" />
                ))}
              </div>
              <a href="#" className="tech-view-details-link">
                View Details
              </a>
            </div>
          </div>
        ))}
      </div>
    </StaffLayout>
  );
}

export default Dashboard;