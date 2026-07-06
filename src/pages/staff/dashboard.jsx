import StaffLayout from './staff_layout';

const feedbacks = [
  { name: 'Jereign', text: 'Amazing work!', rating: 5 },
  { name: 'Gracy', text: 'Super clean and fast service, woohoo!', rating: 5 },
  { name: 'Charlz', text: 'Great job, very professional.', rating: 5 },
];

function Dashboard() {
  return (
    <StaffLayout title="Dashboard">
      <div className="dashboard-welcome-row">
        <h1 className="dashboard-welcome">Welcome, Technician!</h1>
        <div className="dashboard-avatar">👤</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Ongoing Jobs</div>
          <div className="stat-value">0</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed Jobs</div>
          <div className="stat-value">0</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Reports</div>
          <div className="stat-value">0</div>
        </div>
      </div>

      <h2 className="section-title">Customer Feedbacks</h2>
      <div className="feedback-list">
        {feedbacks.map((f) => (
          <div className="feedback-card" key={f.name}>
            <div className="feedback-left">
              <div className="feedback-avatar" />
              <div>
                <div className="feedback-name">{f.name}</div>
                <div className="feedback-text">{f.text}</div>
              </div>
            </div>
            <div className="feedback-right">
              <div className="stars">{'★'.repeat(f.rating)}</div>
              <a href="#" className="view-details-link">View Details</a>
            </div>
          </div>
        ))}
      </div>
    </StaffLayout>
  );
}

export default Dashboard;