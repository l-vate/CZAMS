import { NavLink, useNavigate } from "react-router-dom";
import LogoutButton from '../logout_button';
import { BRAND_NAME, BRAND_SHORT, BRAND_SUB } from '../../config/company';

function CustomerSidebar({ onNavigate }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (onNavigate) onNavigate();
    // replace, so Back does not return to a private page
    navigate("/login", { replace: true });
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

      <LogoutButton onLogout={handleLogout} />
    </aside>
  );
}

export default CustomerSidebar;