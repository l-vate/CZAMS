import StaffLayout from './staff_layout';

const jobs = [
  { date: 'mm-dd-yy', status: 'In Progress', bookingId: 'booking id', address: 'address' },
  { date: 'mm-dd-yy', status: 'Completed', bookingId: 'booking id', address: 'address' },
  { date: 'mm-dd-yy', status: 'Completed', bookingId: 'booking id', address: 'address' },
];

const statusClass = {
  'In Progress': 'status-in-progress',
  Completed: 'status-completed',
};

function MyJobs() {
  return (
    <StaffLayout title="My Jobs">
      <div className="jobs-toolbar">
        <button className="sort-btn" type="button">Sort by ▾</button>
        <input className="search-input" type="text" placeholder="🔍 Search" />
      </div>

      <div className="job-list">
        {jobs.map((job, i) => (
          <div className="job-card" key={i}>
            <div className="job-info">
              <span className="job-date">
                {job.date}
                <span className={`job-status-badge ${statusClass[job.status]}`}>
                  {job.status}
                </span>
              </span>
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

export default MyJobs;