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
          <h1>Cooling Zone Aircon</h1>
          <p>Services</p>
        </div>

        <div className="sidebar-section-label">Technician Portal</div>

        <nav className="sidebar-nav">
          <NavLink
            to="/staff/dashboard"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-icon">▦</span>
            Dashboard
          </NavLink>

          <NavLink
            to="/staff/my_jobs"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-icon">⚙</span>
            My Jobs
          </NavLink>

          <NavLink
            to="/staff/calendar"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-icon">📅</span>
            Calendar
          </NavLink>

          <NavLink
            to="/staff/reports"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-icon">▦</span>
            Reports
          </NavLink>

          <NavLink
            to="/staff/profile"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-icon">👤</span>
            Profile
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-footer">
       <button
  className="logout-btn"
  type="button"
  onClick={handleLogout}
>
          <span className="sidebar-icon">⟲</span>
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;