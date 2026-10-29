import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiCalendar, FiCheckCircle, FiXCircle, FiCreditCard, FiMessageCircle, FiRefreshCw, FiChevronRight } from 'react-icons/fi';
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

// The little round icon in front of a notification, by what it is about: [icon, color family used in notification_bell.css].
function iconFor(type = '') {
  if (type === 'chat_message') return [FiMessageCircle, 'blue'];
  if (type.includes('cancel') || type.includes('rejected') || type.includes('denied') || type.includes('disruption')) return [FiXCircle, 'coral'];
  if (type.includes('approved') || type.includes('completed') || type.includes('verified') || type.includes('confirmed')) return [FiCheckCircle, 'teal'];
  if (type.includes('payment') || type.includes('refund') || type.includes('charge') || type.includes('discount')) return [FiCreditCard, 'amber'];
  if (type.includes('reschedule') || type.includes('extension') || type.includes('progress')) return [FiRefreshCw, 'blue'];
  if (type.includes('booking') || type.includes('job')) return [FiCalendar, 'navy'];
  return [FiBell, 'navy'];
}

// onNotificationClick, when provided, is called with the full notification
// object after it's marked read - the caller decides where a notification with
// a relatedBookingId should navigate to (this component doesn't know its own
// portal's routes). Passed by customer_layout.jsx for the "open that booking's
// details" behavior; staff_layout.jsx doesn't pass it, so staff notifications
// keep their previous mark-as-read-only behavior.
// actionCount and actionRoute (the admin's bell only): how many bookings need action. It is added to the badge and shown as the first row of the
// dropdown, a link to the Needs action tab. It is not a notification, so "Mark all as read" does not touch it.
function NotificationBell({ onNotificationClick, viewAllRoute, actionCount = 0, actionRoute }) {
  const navigate = useNavigate();
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
  const badgeCount = unreadCount + (actionRoute ? actionCount : 0);

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
        aria-label={badgeCount > 0 ? `Notifications, ${badgeCount} new` : 'Notifications'}
      >
        <FiBell />
        {badgeCount > 0 && (
          <span className="notif-bell-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">
              Notifications
              {unreadCount > 0 && <span className="notif-dropdown-count">{unreadCount} new</span>}
            </span>
            {unreadCount > 0 && (
              <button type="button" className="notif-mark-all-btn" onClick={handleMarkAllRead}>
                Mark all as read
              </button>
            )}
          </div>

          {actionRoute && actionCount > 0 && (
            <button
              type="button"
              className="notif-item notif-action-row"
              onClick={() => {
                setOpen(false);
                navigate(actionRoute);
              }}
            >
              <span className="notif-action-text">
                <span className="notif-action-count">{actionCount}</span>
                {actionCount === 1 ? ' booking needs action' : ' bookings need action'}
              </span>
              <FiChevronRight aria-hidden="true" />
            </button>
          )}

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
                  {(() => {
                    const [Icon, tone] = iconFor(n.type);
                    return <span className={`notif-item-icon notif-item-icon--${tone}`} aria-hidden="true"><Icon /></span>;
                  })()}
                  <div className="notif-item-body">
                    <p className="notif-item-message">{n.message}</p>
                    <p className="notif-item-time">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="notif-item-dot" aria-label="Unread" />}
                </div>
              </button>
            ))
          )}

          {viewAllRoute && (
            <div className="notif-dropdown-footer">
              <button
                type="button"
                className="notif-view-all-btn"
                onClick={() => {
                  setOpen(false);
                  navigate(viewAllRoute);
                }}
              >
                View all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
