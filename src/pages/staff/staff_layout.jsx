import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';
import Sidebar from '../../components/sidebars/staff_sidebar';
import NotificationBell from '../../components/notification_bell';
import { technicianNotificationTarget } from '../../utils/notificationTarget';
import Notice from '../../components/notice';
import { useNotificationToasts } from '../../hooks/useNotificationToasts';
import { markNotificationRead } from '../../services/notificationService';

function StaffLayout({ title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // a notification opens the job it is about (or Chat); one with nothing to open is only marked as read
  const handleNotificationClick = (notification) => {
    const target = technicianNotificationTarget(notification);
    if (target) navigate(target);
  };

  // a new job, or a change to a job, that arrives while the app is open: a message at the top with a button to open it
  const { toast, dismiss } = useNotificationToasts();
  const openToast = () => {
    markNotificationRead(toast._id).catch(() => {});
    handleNotificationClick(toast);
  };

  return (
    <div className={`dashboard-shell staff-dashboard-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      <Notice message={toast ? toast.message : ''} onClose={dismiss} action={toast ? { label: 'Open', onClick: openToast } : undefined} />
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
            <NotificationBell onNotificationClick={handleNotificationClick} viewAllRoute="/staff/notifications" />
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