import { useState, useEffect, useRef } from 'react';
import { FiBell } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

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
// object after it's marked read — the caller decides where a notification with
// a relatedBookingId should navigate to (this component doesn't know its own
// portal's routes). Passed by customer_layout.jsx for the "open that booking's
// details" behavior; staff_layout.jsx doesn't pass it, so staff notifications
// keep their previous mark-as-read-only behavior.
function NotificationBell({ onNotificationClick }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  const fetchNotifications = () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => {})
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
    // Previously bailed out entirely for an already-read notification — meaning
    // clicking one a second time did nothing at all, not even navigate.
    if (!notification.read) {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${API_BASE}/api/notifications/${notification._id}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setNotifications((prev) =>
            prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
          );
        }
      } catch (err) {
        // no-op — non-critical
      }
    }

    setOpen(false);
    onNotificationClick?.(notification);
  };

  const handleMarkAllRead = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch (err) {
      // no-op — non-critical
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
