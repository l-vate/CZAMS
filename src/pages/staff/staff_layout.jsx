import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';
import Sidebar from '../../components/sidebars/staff_sidebar';
import NotificationBell from '../../components/notification_bell';
import { technicianNotificationTarget } from '../../utils/notificationTarget';

function StaffLayout({ title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // a notification opens the job it is about (or Chat); one with nothing to open is only marked as read
  const handleNotificationClick = (notification) => {
    const target = technicianNotificationTarget(notification);
    if (target) navigate(target);
  };

  return (
    <div className={`dashboard-shell staff-dashboard-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
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

export default StaffLayout;