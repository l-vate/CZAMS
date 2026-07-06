import { NavLink, useNavigate } from "react-router-dom";

function StaffSidebar() {
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
          Staff Portal
        </p>

        <nav className="sidebar-nav">
          <NavLink
            to="/staff/dashboard"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/staff/my_jobs"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            My Jobs
          </NavLink>

          <NavLink
            to="/staff/calendar"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            Calendar
          </NavLink>

          <NavLink
            to="/staff/reports"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
            Reports
          </NavLink>

          <NavLink
            to="/staff/profile"
            className={({ isActive }) =>
              isActive
                ? "sidebar-link active"
                : "sidebar-link"
            }
          >
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
          Log Out
        </button>
      </div>
    </aside>
  );
}

export default StaffSidebar;