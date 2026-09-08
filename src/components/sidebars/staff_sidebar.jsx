import { NavLink, useNavigate } from 'react-router-dom';

function Sidebar({ onNavigate }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    if (onNavigate) onNavigate();
    navigate('/login');
  };

  const linkClass = ({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`;

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

        <div className="sidebar-section-label">Technician Portal</div>

        <nav className="sidebar-nav">
          <NavLink to="/staff/dashboard" className={linkClass} onClick={onNavigate}>
            Dashboard
          </NavLink>
          <NavLink to="/staff/jobs" className={linkClass} onClick={onNavigate}>
            Jobs
          </NavLink>
          <NavLink to="/staff/calendar" className={linkClass} onClick={onNavigate}>
            Calendar
          </NavLink>
          <NavLink to="/staff/reports" className={linkClass} onClick={onNavigate}>
            Reports
          </NavLink>
          <NavLink to="/staff/profile" className={linkClass} onClick={onNavigate}>
            Profile
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-logout">
        <button type="button" className="sidebar-link" onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;