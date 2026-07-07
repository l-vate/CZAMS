import { NavLink, useNavigate } from 'react-router-dom';

function Sidebar() {
    const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/login');
  };
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
            <span className="sidebar-brand-name">
              Cooling Zone Aircon
            </span>
            <span className="sidebar-brand-sub">
              Services
            </span>
          </div>
        </div>

        <div className="sidebar-section-label">Technician Portal</div>

        <nav className="sidebar-nav">
          <NavLink
            to="/staff/dashboard"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/staff/my_jobs"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            My Jobs
          </NavLink>

          <NavLink
            to="/staff/calendar"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            Calendar
          </NavLink>

          <NavLink
            to="/staff/reports"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            Reports
          </NavLink>

          <NavLink
            to="/staff/profile"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
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

export default Sidebar;