import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import { FiThermometer, FiArrowRight, FiEye, FiCalendar, FiClock, FiMapPin } from 'react-icons/fi';
import { API_BASE } from '../../config/api';
import { BOOKING_STATUS } from '../../constants/bookingStatus';

// Same badge/accent classes as the technician dashboard's "Upcoming jobs" card
// (staff.css) - this section is styled to match that one directly.
const NEXT_SERVICE_BADGE_CLASS = {
  Pending: 'tech-status-pending',
  Approved: 'tech-status-confirmed',
  'In Progress': 'tech-status-in-progress',
};
const NEXT_SERVICE_ACCENT_CLASS = {
  Pending: 'upcoming-job-card--pending',
  Approved: 'upcoming-job-card--approved',
  'In Progress': 'upcoming-job-card--in-progress',
};

// Recent Activity reuses the same card treatment as Next Service, so it needs
// the full status set (Next Service only ever shows non-terminal bookings).
const ACTIVITY_BADGE_CLASS = {
  ...NEXT_SERVICE_BADGE_CLASS,
  Completed: 'tech-status-completed',
  Cancelled: 'tech-status-cancelled',
};
const ACTIVITY_ACCENT_CLASS = {
  ...NEXT_SERVICE_ACCENT_CLASS,
  Completed: 'upcoming-job-card--completed',
  Cancelled: 'upcoming-job-card--cancelled',
};

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
        const res = await fetch(`${API_BASE}/api/bookings/mine`, {
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
    pending: bookings.filter((b) => b.status === BOOKING_STATUS.PENDING).length,
    ongoing: bookings.filter((b) =>
      [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(b.status)
    ).length,
    completed: bookings.filter((b) => b.status === BOOKING_STATUS.COMPLETED).length,
  };

  // booking.time is a slot label ("Morning"/"Afternoon"), not a clock time, so it
  // can't be combined into a parseable Date string - compare by date only and use
  // the slot as a same-day tiebreaker.
  const TIME_SLOT_RANK = { Morning: 0, Afternoon: 1 };
  const toDateTime = (b) => {
    if (!b.date) return null;
    const parsed = new Date(b.date);
    return isNaN(parsed) ? null : parsed;
  };

  // Next upcoming service: soonest future date among non-terminal bookings
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcoming = bookings
    .filter((b) => ![BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(b.status))
    .map((b) => ({ booking: b, dt: toDateTime(b) }))
    .filter((x) => x.dt && x.dt >= now)
    .sort((a, b) => {
      const diff = a.dt - b.dt;
      if (diff !== 0) return diff;
      return (TIME_SLOT_RANK[a.booking.time] ?? 0) - (TIME_SLOT_RANK[b.booking.time] ?? 0);
    });

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
            <div className={`upcoming-job-card ${NEXT_SERVICE_ACCENT_CLASS[nextService.status] || ''}`}>
              <div className="upcoming-job-main">
                <p className="upcoming-job-name">{nextService.service?.name || 'Service'}</p>
                <div className="upcoming-job-meta">
                  <span className="upcoming-job-meta-item">
                    <FiClock /> {nextService.date} - {nextService.time}
                  </span>
                  {nextService.address && (
                    <span className="upcoming-job-meta-item">
                      <FiMapPin /> {nextService.address}
                    </span>
                  )}
                </div>
              </div>
              <span className={`tech-job-status-badge ${NEXT_SERVICE_BADGE_CLASS[nextService.status] || ''}`}>
                {nextService.status}
              </span>
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

        <div className="info-card-body customer-dashboard-x1">
          {recentActivity.length > 0 ? (
            recentActivity.map((b) => (
              <div className={`upcoming-job-card ${ACTIVITY_ACCENT_CLASS[b.status] || ''}`} key={b.bookingId}>
                <div className="upcoming-job-main">
                  <p className="upcoming-job-name">
                    {activityLabel(b)} - {b.service?.name || 'Service'}
                  </p>
                  <div className="upcoming-job-meta">
                    <span className="upcoming-job-meta-item">
                      <FiClock /> {new Date(b.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <span className={`tech-job-status-badge ${ACTIVITY_BADGE_CLASS[b.status] || ''}`}>
                  {b.status}
                </span>
              </div>
            ))
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