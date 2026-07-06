import StaffLayout from './staff_layout';

const scheduledJobs = [
  { date: 'mm-dd-yy', bookingId: 'booking id', address: 'address' },
  { date: 'mm-dd-yy', bookingId: 'booking id', address: 'address' },
  { date: 'mm-dd-yy', bookingId: 'booking id', address: 'address' },
];

function Profile() {
  return (
    <StaffLayout title="Profile">
      <div className="profile-card">
        <div className="profile-avatar-lg">👤</div>
        <div>
          <h2 className="profile-name">JOHN TECHNICIAN</h2>
          <p className="profile-id">company id</p>
          <div className="profile-contact">
            cza-john@mail.com<br />
            09xxxxxxxx
          </div>
        </div>
        <button className="profile-edit-btn" type="button">✎</button>
      </div>

      <h2 className="section-title">Peformance</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Average Client Rating</div>
          <div className="stat-value">9.5</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Job Delays</div>
          <div className="stat-value">0</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Reports</div>
          <div className="stat-value">1</div>
        </div>
      </div>

      <h2 className="section-title">Scheduled Jobs</h2>
      <div className="job-list">
        {scheduledJobs.map((job, i) => (
          <div className="job-card" key={i}>
            <div className="job-info">
              <span className="job-date">{job.date}</span>
              <div className="job-service">
                SERVICE TYPE <span className="job-detail-link">· Detail</span>
              </div>
              <span className="job-booking">{job.bookingId}</span>
            </div>

            <div className="job-meta">
              <span>🕘 --:-- -- – --:-- --</span>
              <span>📍 {job.address}</span>
            </div>

            <a href="#" className="job-view-link">🕘 View Details</a>
          </div>
        ))}
      </div>
    </StaffLayout>
  );
}

export default Profile;