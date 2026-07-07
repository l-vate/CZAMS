import { NavLink, useNavigate } from "react-router-dom";

function AdminSidebar({ onNavigate }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (onNavigate) onNavigate();
    navigate("/login");
  };

  const linkClass = ({ isActive }) => (isActive ? "sidebar-link active" : "sidebar-link");

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

        <p className="sidebar-section-label">Admin Portal</p>

        <nav className="sidebar-nav">
          <NavLink to="/admin/dashboard" className={linkClass} onClick={onNavigate}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/analytics" className={linkClass} onClick={onNavigate}>
            Analytics
          </NavLink>
          <NavLink to="/admin/calendar" className={linkClass} onClick={onNavigate}>
            Calendar
          </NavLink>
          <NavLink to="/admin/manage_accounts" className={linkClass} onClick={onNavigate}>
            Manage Accounts
          </NavLink>
          <NavLink to="/admin/services" className={linkClass} onClick={onNavigate}>
            Services
          </NavLink>
          <NavLink to="/admin/payments" className={linkClass} onClick={onNavigate}>
            Payments
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

export default AdminSidebar;