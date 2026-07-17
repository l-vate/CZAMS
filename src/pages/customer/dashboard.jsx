import { Link } from 'react-router-dom';
import CustomerLayout from './customer_layout';
import { FiThermometer, FiArrowRight, FiEye, FiCalendar, FiClock } from 'react-icons/fi';

function Dashboard() {
  // Placeholder stats — API later
  const stats = {
    pending: 0,
    ongoing: 0,
    completed: 0,
  };
  const storedUser = localStorage.getItem('user');
  const firstName = storedUser
    ? (JSON.parse(storedUser).name || '').split(' ')[0]
    : 'User';


  return (
    <CustomerLayout title="Dashboard">
      {/* Welcome */}
      <h1 className="dashboard-welcome">
        Welcome, {firstName}!
      </h1>

      {/* Book Service Banner */}
      <Link
        to="/customer/book_service"
        className="book-banner"
      >
        <div className="book-banner-left">
          <div className="book-banner-icon">
            <FiThermometer />
          </div>

          <div className="book-banner-text">
            <h3>BOOK A SERVICE</h3>
            <p>
              Cleaning, repair, installation,
              or maintenance
            </p>
          </div>
        </div>

        <div className="book-banner-arrow">
          <FiArrowRight />
        </div>
      </Link>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <p className="stat-card-label">
            Pending Requests
          </p>
          <p className="stat-card-value">
            {stats.pending}
          </p>
        </div>

        <div className="stat-card">
          <p className="stat-card-label">
            Ongoing Service
          </p>
          <p className="stat-card-value">
            {stats.ongoing}
          </p>
        </div>

        <div className="stat-card">
          <p className="stat-card-label">
            Completed
          </p>
          <p className="stat-card-value">
            {stats.completed}
          </p>
        </div>
      </div>

      {/* Next Service */}
      <div className="info-card">
        <div className="info-card-header">
          <h4>Next service</h4>

          <Link
            to="/customer/bookings"
            className="info-card-view-all"
          >
            <FiEye /> View all
          </Link>
        </div>

        <div className="info-card-body">
          <div className="info-card-empty">
            <span className="empty-icon">
              <FiCalendar />
            </span>

            <p>
              No upcoming bookings.{' '}
              <Link to="/customer/book_service">
                Book one now
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="info-card">
        <div className="info-card-header">
          <h4>Recent activity</h4>
        </div>

        <div className="info-card-body">
          <div className="info-card-empty">
            <span className="empty-icon">
              <FiClock />
            </span>

            <p>No activity yet.</p>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}

export default Dashboard;