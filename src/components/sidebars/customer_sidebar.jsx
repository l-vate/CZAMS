import { NavLink, useNavigate } from "react-router-dom";
import { FiLogOut } from 'react-icons/fi';
import { BRAND_NAME, BRAND_SHORT, BRAND_SUB } from '../../config/company';

function CustomerSidebar({ onNavigate }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (onNavigate) onNavigate();
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
            alt={`${BRAND_NAME} logo`}
            className="sidebar-logo"
          />
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">{BRAND_SHORT}</span>
            <span className="sidebar-brand-sub">{BRAND_SUB}</span>
          </div>
        </div>

        <p className="sidebar-section-label">Customer Portal</p>

        <nav className="sidebar-nav">
          <NavLink to="/customer/dashboard" className={linkClass} onClick={onNavigate}>
            Dashboard
          </NavLink>
          <NavLink to="/customer/book_service" className={linkClass} onClick={onNavigate}>
            Book Service
          </NavLink>
          <NavLink to="/customer/bookings" className={linkClass} onClick={onNavigate}>
            My Bookings
          </NavLink>
          <NavLink to="/customer/billings" className={linkClass} onClick={onNavigate}>
            Payment & Billing
          </NavLink>
          <NavLink to="/customer/profile" className={linkClass} onClick={onNavigate}>
            Profile
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-logout">
        <button type="button" className="sidebar-link" onClick={handleLogout}>
          <FiLogOut aria-hidden="true" /> Log Out
        </button>
      </div>
    </aside>
  );
}

export default CustomerSidebar;