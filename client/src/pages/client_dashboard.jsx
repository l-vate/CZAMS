import { Link, useNavigate } from 'react-router-dom';

function ClientDashboard() {
  const navigate = useNavigate();

  // Placeholder stats — will come from Express API later
  const stats = {
    pending: 0,
    ongoing: 0,
    completed: 0,
  };

  const handleLogout = () => {
    // TODO: clear session/token then redirect
    navigate('/login');
  };

  return (
    <div className="dashboard-shell">

      {/* ---- SIDEBAR ---- */}
      <aside className="sidebar">

        {/* Brand */}
        <div>
          <div className="sidebar-brand">
            <img src="/images/logo.png" alt="Logo" className="sidebar-logo" />
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">Cooling Zone Aircon</span>
              <span className="sidebar-brand-sub">Services</span>
            </div>
          </div>

          <p className="sidebar-section-label">Customer Portal</p>

          <nav className="sidebar-nav">
            <Link to="/dashboard" className="sidebar-link active">
              <span className="link-icon">📊</span>
              Dashboard
            </Link>
            <Link to="/book-service" className="sidebar-link">
              <span className="link-icon">📋</span>
              Book Service
            </Link>
            <Link to="/my-bookings" className="sidebar-link">
              <span className="link-icon">📁</span>
              My Bookings
            </Link>
            <Link to="/payment-billing" className="sidebar-link">
              <span className="link-icon">💳</span>
              Payment &amp; Billing
            </Link>
            <Link to="/profile" className="sidebar-link">
              <span className="link-icon">👤</span>
              Profile
            </Link>
          </nav>
        </div>

        {/* Logout */}
        <div className="sidebar-logout">
          <button className="sidebar-link" onClick={handleLogout}>
            <span className="link-icon">🚪</span>
            Log out
          </button>
        </div>

      </aside>

      {/* ---- MAIN CONTENT ---- */}
      <div className="dashboard-main">

        {/* Top bar */}
        <div className="dashboard-topbar">Dashboard</div>

        {/* Body */}
        <div className="dashboard-body">

          {/* Welcome */}
          <h1 className="dashboard-welcome">Welcome, User!</h1>

          {/* Book a Service banner */}
          <Link to="/book_service" className="book-banner">
            <div className="book-banner-left">
              <div className="book-banner-icon">❄️</div>
              <div className="book-banner-text">
                <h3>BOOK A SERVICE</h3>
                <p>Cleaning, repair, installation, or maintenance</p>
              </div>
            </div>
            <div className="book-banner-arrow">→</div>
          </Link>

          {/* Stats row */}
          <div className="stats-row">
            <div className="stat-card">
              <p className="stat-card-label">Pending Requests</p>
              <p className="stat-card-value">{stats.pending}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-label">Ongoing Service</p>
              <p className="stat-card-value">{stats.ongoing}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-label">Completed</p>
              <p className="stat-card-value">{stats.completed}</p>
            </div>
          </div>

          {/* Next service */}
          <div className="info-card">
            <div className="info-card-header">
              <h4>Next service</h4>
              <Link to="/my-bookings" className="info-card-view-all">
                👁 View all
              </Link>
            </div>
            <div className="info-card-body">
              <div className="info-card-empty">
                <span className="empty-icon">📅</span>
                <p>
                  No upcoming bookings.{' '}
                  <Link to="/book-service">Book one now</Link>
                </p>
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="info-card">
            <div className="info-card-header">
              <h4>Recent activity</h4>
            </div>
            <div className="info-card-body">
              <div className="info-card-empty">
                <span className="empty-icon">🕐</span>
                <p>No activity yet.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default ClientDashboard;