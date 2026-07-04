import { Link, useNavigate } from 'react-router-dom';

function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    // TODO: clear session/token
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div>
        {/* Brand */}
        <div className="sidebar-brand">
          <img
            src="/images/logo.png"
            alt="Logo"
            className="sidebar-logo"
          />

          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">
              Cooling Zone Aircon
            </span>
            <span className="sidebar-brand-sub">
              Services
            </span>
          </div>
        </div>

        <p className="sidebar-section-label">
          Customer Portal
        </p>

        <nav className="sidebar-nav">
          <Link to="/dashboard" className="sidebar-link active">
            <span className="link-icon">📊</span>
            Dashboard
          </Link>

          <Link to="/book_service" className="sidebar-link">
            <span className="link-icon">📋</span>
            Book Service
          </Link>

          <Link to="/my-bookings" className="sidebar-link">
            <span className="link-icon">📁</span>
            My Bookings
          </Link>

          <Link to="/payment-billing" className="sidebar-link">
            <span className="link-icon">💳</span>
            Payment & Billing
          </Link>

          <Link to="/profile" className="sidebar-link">
            <span className="link-icon">👤</span>
            Profile
          </Link>
        </nav>
      </div>

      <div className="sidebar-logout">
        <button
          className="sidebar-link"
          onClick={handleLogout}
        >
          <span className="link-icon">🚪</span>
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;