import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import { FiThermometer, FiArrowRight, FiEye, FiCalendar, FiClock } from 'react-icons/fi';

function Dashboard() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const storedUser = localStorage.getItem('user');
  const firstName = storedUser
    ? (JSON.parse(storedUser).name || '').split(' ')[0]
    : 'User';

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('http://localhost:5000/api/bookings/mine', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setBookings(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load bookings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, []);

  // ---- Derived stats ----
  const stats = {
    pending: bookings.filter((b) => b.status === 'Pending').length,
    ongoing: bookings.filter((b) =>
      ['Approved', 'In Progress'].includes(b.status)
    ).length,
    completed: bookings.filter((b) => b.status === 'Completed').length,
  };

  // Combine date + time strings into a real Date for comparison/sorting
  const toDateTime = (b) => {
    if (!b.date) return null;
    const t = b.time ? b.time : '00:00';
    const parsed = new Date(`${b.date} ${t}`);
    return isNaN(parsed) ? null : parsed;
  };

  // Next upcoming service: soonest future date among non-terminal bookings
  const now = new Date();
  const upcoming = bookings
    .filter((b) => !['Completed', 'Cancelled'].includes(b.status))
    .map((b) => ({ booking: b, dt: toDateTime(b) }))
    .filter((x) => x.dt && x.dt >= now)
    .sort((a, b) => a.dt - b.dt);

  const nextService = upcoming[0]?.booking;

  // Recent activity: most recently updated bookings, newest first
  const recentActivity = [...bookings]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  const activityLabel = (b) => {
    switch (b.status) {
      case 'Pending': return 'Booking submitted';
      case 'Approved': return 'Booking approved';
      case 'In Progress': return 'Service in progress';
      case 'Completed': return 'Service completed';
      case 'Cancelled': return 'Booking cancelled';
      default: return 'Booking updated';
    }
  };

  return (
    <CustomerLayout title="Dashboard">
      <h1 className="dashboard-welcome">Welcome, {firstName}!</h1>

      <Link to="/customer/book_service" className="book-banner">
        <div className="book-banner-left">
          <div className="book-banner-icon"><FiThermometer /></div>
          <div className="book-banner-text">
            <h3>BOOK A SERVICE</h3>
            <p>Cleaning, repair, installation, or maintenance</p>
          </div>
        </div>
        <div className="book-banner-arrow"><FiArrowRight /></div>
      </Link>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <p className="stat-card-label">Pending Requests</p>
          <p className="stat-card-value">{loading ? '–' : stats.pending}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Ongoing Service</p>
          <p className="stat-card-value">{loading ? '–' : stats.ongoing}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Completed</p>
          <p className="stat-card-value">{loading ? '–' : stats.completed}</p>
        </div>
      </div>

      {/* Next Service */}
      <div className="info-card">
        <div className="info-card-header">
          <h4>Next service</h4>
          <Link to="/customer/bookings" className="info-card-view-all">
            <FiEye /> View all
          </Link>
        </div>
        <div className="info-card-body">
          {nextService ? (
            <div className="next-service-item">
              <p className="next-service-name">
                {nextService.service?.name || 'Service'}
              </p>
              <p className="next-service-datetime">
                {nextService.date} — {nextService.time}
              </p>
              <p className="next-service-status">{nextService.status}</p>
            </div>
          ) : (
            <div className="info-card-empty">
              <span className="empty-icon"><FiCalendar /></span>
              <p>
                No upcoming bookings.{' '}
                <Link to="/customer/book_service">Book one now</Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="info-card">
        <div className="info-card-header">
          <h4>Recent activity</h4>
        </div>

        <div className="info-card-body">
          {recentActivity.length > 0 ? (
            <ul className="recent-activity-list" style={{ maxHeight: '340px', overflowY: 'auto' }}>
              {recentActivity.map((b) => (
                <li key={b.bookingId} className="recent-activity-item">
                  <span className="recent-activity-icon">
                    <FiClock />
                  </span>
                  <div className="recent-activity-text">
                    <p className="recent-activity-title">
                      {activityLabel(b)} — {b.service?.name || 'Service'}
                    </p>
                    <p className="recent-activity-time">
                      {new Date(b.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`recent-activity-status status-${b.status.toLowerCase().replace(' ', '-')}`}>
                    {b.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="info-card-empty">
              <span className="empty-icon"><FiClock /></span>
              <p>No activity yet.</p>
            </div>
          )}
        </div>
      </div>
    </CustomerLayout>
  );
}

export default Dashboard;