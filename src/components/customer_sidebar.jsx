import { NavLink, useNavigate } from "react-router-dom";

function CustomerSidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    // TODO: Clear authentication data
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    navigate("/login");
  };

  return (
    <aside className="sidebar">
      <div>
        {/* Brand */}
        <div className="sidebar-brand">
          <img
            src="/images/logo.png"
            alt="Cooling Zone Aircon Services"
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
          <NavLink
            to="/customer/dashboard"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">📊</span>
            Dashboard
          </NavLink>

          <NavLink
            to="/customer/book_service"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">📋</span>
            Book Service
          </NavLink>

          <NavLink
            to="/customer/bookings"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">📁</span>
            My Bookings
          </NavLink>

          <NavLink
            to="/customer/payments"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">💳</span>
            Payment & Billing
          </NavLink>

          <NavLink
            to="/customer/profile"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">👤</span>
            Profile
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-logout">
        <button
          type="button"
          className="sidebar-link"
          onClick={handleLogout}
        >
          <span className="link-icon">🚪</span>
          Log Out
        </button>
      </div>
    </aside>
  );
}

export default CustomerSidebar;
