import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom"; 
import { BRAND_NAME, BRAND_SHORT, BRAND_SUB } from '../../config/company';

function AdminSidebar({ onNavigate }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Routes that live under the "Services" dropdown - deliberately excludes
  // /admin/services/requests, which is its own top-level "Service Requests"
  // link despite sharing the /admin/services prefix.
  const isServicesSubRoute =
    location.pathname.startsWith("/admin/services/manage") ||
    location.pathname.startsWith("/admin/services/units") ||
    location.pathname.startsWith("/admin/services/reports") ||
    location.pathname.startsWith("/admin/payment-settings");

  // Keep the dropdown open automatically if we're already on a services sub-route
  const [servicesOpen, setServicesOpen] = useState(isServicesSubRoute);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (onNavigate) onNavigate();
    navigate("/login");
  };

  const linkClass = ({ isActive }) => (isActive ? "sidebar-link active" : "sidebar-link");

  const subLinkClass = ({ isActive }) =>
    isActive ? "sidebar-sublink active" : "sidebar-sublink";

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

        <p className="sidebar-section-label">Admin Portal</p>

        <nav className="sidebar-nav">
          <NavLink to="/admin/dashboard" className={linkClass} onClick={onNavigate}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/calendar" className={linkClass} onClick={onNavigate}>
            Calendar
          </NavLink>
          <NavLink to="/admin/services/requests" className={linkClass} onClick={onNavigate}>
            Service Requests
          </NavLink>
          <NavLink to="/admin/manage_accounts" className={linkClass} onClick={onNavigate}>
            Manage Accounts
          </NavLink>

          {/* ── Services dropdown ───────────────────────── */}
          <div className="sidebar-dropdown">
            <button
              type="button"
              className={`sidebar-link sidebar-dropdown-toggle ${
                isServicesSubRoute ? "active" : ""
              }`}
              onClick={() => setServicesOpen((prev) => !prev)}
            >
              <span>Services</span>
              <svg
                className={`sidebar-dropdown-icon ${servicesOpen ? "open" : ""}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <div className={`sidebar-submenu ${servicesOpen ? "open" : ""}`}>
              <NavLink
                to="/admin/services/manage"
                className={subLinkClass}
                onClick={onNavigate}
              >
                Manage Services
              </NavLink>
              <NavLink
                to="/admin/services/units"
                className={subLinkClass}
                onClick={onNavigate}
              >
                Supplied Units
              </NavLink>
              <NavLink
                to="/admin/payment-settings"
                className={subLinkClass}
                onClick={onNavigate}
              >
                Manage Payment Settings
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

          <NavLink to="/admin/promotions" className={linkClass} onClick={onNavigate}>
            Promotions
          </NavLink>
          <NavLink to="/admin/payments" className={linkClass} onClick={onNavigate}>
            Payments
          </NavLink>
          <NavLink to="/admin/back-jobs" className={linkClass} onClick={onNavigate}>
            Back Jobs
          </NavLink>
          <NavLink to="/admin/announcements" className={linkClass} onClick={onNavigate}>
            Announcements
          </NavLink>
          <NavLink to="/admin/analytics" className={linkClass} onClick={onNavigate}>
            Analytics
          </NavLink>
          <NavLink to="/admin/reports" className={linkClass} onClick={onNavigate}>
            Reports
          </NavLink>
          <NavLink to="/admin/audit-log" className={linkClass} onClick={onNavigate}>
            Audit Log
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