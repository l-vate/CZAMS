import { NavLink, useNavigate } from "react-router-dom";

function AdminSidebar() {
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
          Admin Portal
        </p>

        <nav className="sidebar-nav">
          <NavLink
            to="/admin/dashboard"
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
            to="/admin/bookings"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">📁</span>
            Manage Bookings
          </NavLink>

          <NavLink
            to="/admin/staff"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">🧑‍🔧</span>
            Manage Staff
          </NavLink>

          <NavLink
            to="/admin/customers"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">👥</span>
            Manage Customers
          </NavLink>

          <NavLink
            to="/admin/services"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">🛠️</span>
            Services
          </NavLink>

          <NavLink
            to="/admin/billings"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">💳</span>
            Payments & Billing
          </NavLink>

          <NavLink
            to="/admin/reports"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            <span className="link-icon">📈</span>
            Reports
          </NavLink>

          <NavLink
            to="/admin/profile"
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

export default AdminSidebar;
