import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";

function AdminSidebar({ onNavigate }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    if (onNavigate) {
      onNavigate();
    }

    navigate("/login");
  };

  // Keep the dropdown open when on a services sub-route
  const [servicesOpen, setServicesOpen] = useState(
    location.pathname.startsWith("/admin/services")
  );

  const linkClass = ({ isActive }) =>
    isActive ? "sidebar-link active" : "sidebar-link";

  const subLinkClass = ({ isActive }) =>
    isActive ? "sidebar-sublink active" : "sidebar-sublink";

  const handleServicesClick = (event) => {
    event.preventDefault();
    setServicesOpen((prev) => !prev);
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
            <span className="sidebar-brand-name">Cooling Zone Aircon</span>
            <span className="sidebar-brand-sub">Services</span>
          </div>
        </div>

        <p className="sidebar-section-label">Admin Portal</p>

        <nav className="sidebar-nav">
          <NavLink
            to="/admin/dashboard"
            className={linkClass}
            onClick={onNavigate}
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/admin/calendar"
            className={linkClass}
            onClick={onNavigate}
          >
            Calendar
          </NavLink>

          <div className="sidebar-dropdown">
            <NavLink
              to="/admin/services"
              className={() =>
                `sidebar-link ${
                  location.pathname.startsWith("/admin/services")
                    ? "active"
                    : ""
                }`
              }
              onClick={handleServicesClick}
            >
              <span>Services</span>
            </NavLink>

            <div
              className={`sidebar-submenu ${
                servicesOpen ? "open" : ""
              }`}
            >
              <NavLink
                to="/admin/services/manage"
                className={subLinkClass}
                onClick={onNavigate}
              >
                Manage Services
              </NavLink>

              <NavLink
                to="/admin/services/requests"
                className={subLinkClass}
                onClick={onNavigate}
              >
                Service Requests
              </NavLink>

              <NavLink
                to="/admin/services/reports"
                className={subLinkClass}
                onClick={onNavigate}
              >
                Service Reports
              </NavLink>
            </div>
          </div>

          <NavLink
            to="/admin/manage_accounts"
            className={linkClass}
            onClick={onNavigate}
          >
            Manage Accounts
          </NavLink>

          <NavLink
            to="/admin/analytics"
            className={linkClass}
            onClick={onNavigate}
          >
            Analytics
          </NavLink>

          <NavLink
            to="/admin/payments"
            className={linkClass}
            onClick={onNavigate}
          >
            Payments
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

export default AdminSidebar;