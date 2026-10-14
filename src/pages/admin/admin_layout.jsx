import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiX, FiMessageCircle, FiSearch } from 'react-icons/fi';
import Sidebar from '../../components/sidebars/admin_sidebar';
import NotificationBell from '../../components/notification_bell';

import { adminNotificationTarget } from '../../utils/notificationTarget';
// Search moved here (topbar), same pattern as the customer portal - pages that
// need search pass searchValue/onSearchChange/searchPlaceholder in and get the
// topbar box; pages that don't just omit those props and get nothing.
function AdminLayout({ title, children, searchValue, onSearchChange, searchPlaceholder }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleNotificationClick = (notification) => {
    const target = adminNotificationTarget(notification);
    if (target) navigate(target);
  };

  return (
    <div className={`dashboard-shell admin-dashboard-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
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
            {/* Chat is now reached from here rather than a permanent sidebar
                tab - this is the one access point, on every admin page, into
                the conversation inbox. */}
            <button
              type="button"
              className="topbar-support-btn"
              onClick={() => navigate('/admin/chat')}
              aria-label="Chat"
              title="Chat"
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

export default AdminLayout;