import { useEffect, useRef, useState } from 'react';
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
  // On a phone (up to 768 px) the search box folds into an icon; this opens it full width over the top bar. Wider screens ignore it.
  // Same pattern as the admin top bar (pages/admin/admin_layout.jsx).
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchToggleRef = useRef(null);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);
  const closeSearch = () => {
    setSearchOpen(false);
    searchToggleRef.current?.focus();
  };
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
        <div className={`dashboard-topbar${searchOpen ? ' topbar-search-open' : ''}`}>
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
          <span className="dashboard-topbar-title">{title}</span>
          <div className="dashboard-topbar-actions">
            {onSearchChange && (
              <>
                <button
                  type="button"
                  ref={searchToggleRef}
                  className={`topbar-support-btn topbar-search-toggle${searchValue ? ' has-query' : ''}`}
                  onClick={() => setSearchOpen(true)}
                  aria-label={searchValue ? 'Search, a search is active' : 'Search'}
                  aria-expanded={searchOpen}
                  aria-controls="topbar-search-box"
                >
                  <FiSearch />
                </button>
                <div className="topbar-search" id="topbar-search-box" role="search">
                  <FiSearch aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    placeholder={searchPlaceholder || 'Search...'}
                    aria-label={(searchPlaceholder || 'Search').replace(/.{3}$/, '')}
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape' && searchOpen) { e.preventDefault(); closeSearch(); } }}
                  />
                  <button type="button" className="topbar-search-close" onClick={closeSearch} aria-label="Close search">
                    <FiX />
                  </button>
                </div>
              </>
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
            <NotificationBell onNotificationClick={handleNotificationClick} viewAllRoute="/customer/notifications" />
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