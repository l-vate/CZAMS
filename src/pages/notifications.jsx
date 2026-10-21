import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AdminLayout from './admin/admin_layout';
import CustomerLayout from './customer/customer_layout';
import StaffLayout from './staff/staff_layout';
import { ROLE } from '../constants/roles';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService';
import {
  adminNotificationTarget,
  customerNotificationTarget,
  technicianNotificationTarget,
} from '../utils/notificationTarget';

function getStoredUserRole() {
  try {
    const raw = localStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    return user?.role || null;
  } catch {
    return null;
  }
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const role = getStoredUserRole();

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await listNotifications();
      setNotifications(Array.isArray(data) ? data : []);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleNotificationClick = async (notification) => {
    if (!notification.read) {
      try {
        await markNotificationRead(notification._id);
        setNotifications((prev) =>
          prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
        );
      } catch {
        // no-op - keep navigation working even if marking read fails.
      }
    }

    let target = null;
    if (role === ROLE.ADMIN) {
      target = adminNotificationTarget(notification);
    } else if (role === ROLE.STAFF) {
      target = technicianNotificationTarget(notification);
    } else {
      target = customerNotificationTarget(notification);
    }

    if (target) navigate(target);
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // no-op - non-critical
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const layoutMap = {
    [ROLE.ADMIN]: AdminLayout,
    [ROLE.STAFF]: StaffLayout,
    [ROLE.CUSTOMER]: CustomerLayout,
  };
  const Layout = layoutMap[role] || CustomerLayout;

  return (
    <Layout title="Notifications">
      <div className="notif-page">
        <div className="notif-page-header">
          <h2 className="notif-page-title">All notifications</h2>
          {unreadCount > 0 && (
            <button type="button" className="notif-mark-all-btn" onClick={handleMarkAllRead}>
              Mark all as read
            </button>
          )}
        </div>

        {loading ? (
          <div className="notif-page-empty">Loading notifications...</div>
        ) : loadFailed ? (
          <div className="notif-page-empty" role="alert">
            Could not load notifications.
            <button type="button" className="notif-mark-all-btn notif-page-retry" onClick={fetchNotifications}>
              Retry
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notif-page-empty">No notifications yet.</div>
        ) : (
          <div className="notif-page-list">
            {notifications.map((n) => (
              <button
                key={n._id}
                type="button"
                className={`notif-item notif-page-item ${!n.read ? 'unread' : ''}`}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="notif-item-row">
                  <span className={`notif-item-dot ${n.read ? 'read' : ''}`} />
                  <div>
                    <p className="notif-item-message">{n.message}</p>
                    <p className="notif-item-time">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default NotificationsPage;
