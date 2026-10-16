import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession } from '../../utils/session';
import { BRAND_NAME, BRAND_SHORT, BRAND_SUB } from '../../config/company';

function Sidebar({ onNavigate }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearSession();
    if (onNavigate) onNavigate();
    // replace, so Back does not return to a private page
    navigate('/login', { replace: true });
  };

  const linkClass = ({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`;

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand">
          <img
            src="/images/logo.png"
            alt={`${BRAND_NAME} logo`}
            className="sidebar-logo"
          />
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">{BRAND_SHORT}</span>
            <span className="sidebar-brand-sub">{BRAND_SUB}</span>
          </div>
        </div>

        <div className="sidebar-section-label">Technician Portal</div>

        <nav className="sidebar-nav">
          <NavLink to="/staff/dashboard" className={linkClass} onClick={onNavigate}>
            Dashboard
          </NavLink>
          <NavLink to="/staff/my_jobs" className={linkClass} onClick={onNavigate}>
            My Jobs
          </NavLink>
          <NavLink to="/staff/calendar" className={linkClass} onClick={onNavigate}>
            Calendar
          </NavLink>
          <NavLink to="/staff/reports" className={linkClass} onClick={onNavigate}>
            Reports
          </NavLink>
          <NavLink to="/staff/chat" className={linkClass} onClick={onNavigate}>
            Chat
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