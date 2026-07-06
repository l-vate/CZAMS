import { useState } from 'react';
import StaffLayout from './staff_layout';

const reports = [
  { bookingId: 'booking id', dueDate: 'mm-dd--yy', status: 'Pending' },
  { bookingId: 'booking id', dueDate: 'mm-dd--yy', status: 'Completed' },
  { bookingId: 'booking id', dueDate: 'mm-dd--yy', status: 'Completed' },
];

function Reports() {
  const [filter, setFilter] = useState('Pending');

  const visibleReports =
    filter === 'All' ? reports : reports.filter((r) => r.status === filter);

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

      <div className="job-list">
        {visibleReports.map((r, i) => (
          <div className="job-card" key={i}>
            <div className="job-info">
              <div className="job-service">
                SERVICE TYPE <span className="job-detail-link">· Detail</span>
              </div>
              <span className="job-booking">{r.bookingId}</span>
            </div>

            <div className="job-meta">
              <span>🕘 Complete on {r.dueDate}</span>
            </div>

            <a href="#" className="job-view-link">
              🕘 {r.status === 'Pending' ? 'Submit Report' : 'View Report'}
            </a>
          </div>
        ))}
      </div>
    </StaffLayout>
  );
}

export default Reports;