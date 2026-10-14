import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiX, FiMessageCircle, FiSearch } from 'react-icons/fi';
import Sidebar from '../../components/sidebars/customer_sidebar';
import NotificationBell from '../../components/notification_bell';

import { customerNotificationTarget } from '../../utils/notificationTarget';
// Search moved here (topbar) rather than duplicated per-page - My Bookings and
// Payment & Billing pass searchValue/onSearchChange/searchPlaceholder to opt
// into showing it; every other page just omits those props and gets nothing.
function CustomerLayout({ title, children, searchValue, onSearchChange, searchPlaceholder }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleNotificationClick = (notification) => {
    const target = customerNotificationTarget(notification);
    if (target) navigate(target);
  };

  return (
    <div className={`dashboard-shell customer-dashboard-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      <Sidebar onNavigate={() => setSidebarOpen(false)} />

      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />

      <div className="dashboard-main">
        <div className="dashboard-topbar">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
          {title}
          <div className="dashboard-topbar-actions">
            {onSearchChange && (
              <div className="topbar-search">
                <FiSearch />
                <input
                  type="search"
                  placeholder={searchPlaceholder || 'Search...'}
                  aria-label={(searchPlaceholder || 'Search').replace(/\.{3}$/, '')}
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
            )}
            {/* Chat is on-demand, not a persistent sidebar tab - this is the one
                access point, available from every page, for when a customer
                actually has a question for support. */}
            <button
              type="button"
              className="topbar-support-btn"
              onClick={() => navigate('/customer/chat')}
              aria-label="Contact Support"
              title="Contact Support"
            >
              <FiMessageCircle />
            </button>
            <NotificationBell onNotificationClick={handleNotificationClick} />
          </div>
        </div>

        <div className="dashboard-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export default CustomerLayout;