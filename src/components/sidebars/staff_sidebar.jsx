import { NavLink, useNavigate } from "react-router-dom";

function StaffSidebar({ onNavigate }) {
  const navigate = useNavigate();

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    if (onNavigate) {
      onNavigate();
    }

    navigate("/login");
  };

  const linkClass = ({ isActive }) =>
    isActive ? "sidebar-link active" : "sidebar-link";

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand">
          <img
            src="/images/logo.png"
            alt="Cooling Zone Aircon Services"
            className="sidebar-logo"
          />

          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">Cooling Zone Aircon</span>
            <span className="sidebar-brand-sub">Services</span>
          </div>
        </div>

        <p className="sidebar-section-label">Technician Portal</p>

        <nav className="sidebar-nav">
          <NavLink
            to="/staff/dashboard"
            className={linkClass}
            onClick={onNavigate}
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/staff/jobs"
            className={linkClass}
            onClick={onNavigate}
          >
            Jobs
          </NavLink>

          <NavLink
            to="/staff/calendar"
            className={linkClass}
            onClick={onNavigate}
          >
            Calendar
          </NavLink>

          <NavLink
            to="/staff/reports"
            className={linkClass}
            onClick={onNavigate}
          >
            Reports
          </NavLink>

          <NavLink
            to="/staff/profile"
            className={linkClass}
            onClick={onNavigate}
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
