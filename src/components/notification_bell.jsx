import { useState, useEffect, useRef } from 'react';
import { FiBell } from 'react-icons/fi';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notificationService';


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

// onNotificationClick, when provided, is called with the full notification
// object after it's marked read - the caller decides where a notification with
// a relatedBookingId should navigate to (this component doesn't know its own
// portal's routes). Passed by customer_layout.jsx for the "open that booking's
// details" behavior; staff_layout.jsx doesn't pass it, so staff notifications
// keep their previous mark-as-read-only behavior.
function NotificationBell({ onNotificationClick }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const wrapperRef = useRef(null);

  const fetchNotifications = () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    listNotifications()
      .then((data) => {
        setNotifications(Array.isArray(data) ? data : []);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true)) // shown in the dropdown, never an empty "No notifications yet."
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    // eslint-disable-next-line no-restricted-syntax -- outside click: removed in this effect's cleanup
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleToggle = () => {
    setOpen((prev) => {
      if (!prev) fetchNotifications(); // refresh on open
      return !prev;
    });
  };

  const handleItemClick = async (notification) => {
    // Previously bailed out entirely for an already-read notification - meaning
    // clicking one a second time did nothing at all, not even navigate.
    if (!notification.read) {
      try {
        await markNotificationRead(notification._id);
        setNotifications((prev) =>
          prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
        );
      } catch {
        // no-op - non-critical
      }
    }

    setOpen(false);
    onNotificationClick?.(notification);
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // no-op - non-critical
    }
  };

  return (
    <div className="notif-bell-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={handleToggle}
        aria-label="Notifications"
      >
        <FiBell />
        {unreadCount > 0 && (
          <span className="notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="notif-mark-all-btn" onClick={handleMarkAllRead}>
                Mark all as read
              </button>
            )}
          </div>

          {loading ? (
            <div className="notif-dropdown-empty">Loading...</div>
          ) : loadFailed ? (
            <div className="notif-dropdown-empty" role="alert">
              Could not load notifications.{' '}
              <button type="button" className="notif-mark-all-btn" onClick={fetchNotifications}>Retry</button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notif-dropdown-empty">No notifications yet.</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n._id}
                type="button"
                className={`notif-item ${!n.read ? 'unread' : ''}`}
                onClick={() => handleItemClick(n)}
              >
                <div className="notif-item-row">
                  <span className={`notif-item-dot ${n.read ? 'read' : ''}`} />
                  <div>
                    <p className="notif-item-message">{n.message}</p>
                    <p className="notif-item-time">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
