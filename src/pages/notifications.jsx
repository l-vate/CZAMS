import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import AdminLayout from './admin/admin_layout';
import CustomerLayout from './customer/customer_layout';
import StaffLayout from './staff/staff_layout';
import { NotificationsCenterView } from '../components/notifications_center';
import { readFilterFor } from '../constants/notificationCategories';
import { ROLE } from '../constants/roles';
import { useNeedsAttention } from '../hooks/useNeedsAttention';
import {
  getNotificationCounts,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService';
import {
  adminNotificationTarget,
  customerNotificationTarget,
  technicianNotificationTarget,
} from '../utils/notificationTarget';
import { markCategoryRead } from '../utils/notificationGroups';
import { readSession, resolveView, saveSession, viewToParams } from '../utils/notificationView';

// The page asks for more than the bell's newest 30, so the list covers a useful stretch of history. The counts on the tabs do not depend on it:
// they come from the server for every notification the user has.
const PAGE_LIMIT = 200;

function getStoredUserRole() {
  try {
    const raw = localStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    return user?.role || null;
  } catch {
    return null;
  }
}

function NotificationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notifications, setNotifications] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const role = getStoredUserRole();
  const isAdmin = role === ROLE.ADMIN;
  const needs = useNeedsAttention();

  // The view (tab, sort, unread only) is in the address (?category=payments&sort=unread&unread=1), so a link opens it and the back button keeps
  // it, and it is remembered for the session. The address wins; Needs action is for an admin only.
  const view = resolveView(searchParams, readSession(), isAdmin);
  const changeView = (patch) => {
    const next = { ...view, ...patch };
    saveSession(next);
    setSearchParams(viewToParams(next), { replace: true });
  };

  const fetchCounts = () => {
    getNotificationCounts()
      .then((rows) => { if (Array.isArray(rows)) setCounts(rows); })
      .catch(() => {
        // the tabs fall back to counting the loaded list
      });
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await listNotifications(PAGE_LIMIT);
      setNotifications(Array.isArray(data) ? data : []);
      setLoadFailed(false);
      fetchCounts();
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
        fetchCounts();
      } catch {
        // no-op - keep navigation working even if marking read fails.
      }
    }

    let target;
    if (role === ROLE.ADMIN) {
      target = adminNotificationTarget(notification);
    } else if (role === ROLE.STAFF) {
      target = technicianNotificationTarget(notification);
    } else {
      target = customerNotificationTarget(notification);
    }

    if (target) navigate(target);
  };

  // `category` is 'all' or one category: only that one is marked, on the server and on the screen
  const handleMarkAllRead = async (category) => {
    try {
      await markAllNotificationsRead(readFilterFor(category === 'all' ? null : category));
      setNotifications((prev) => markCategoryRead(prev, category));
      fetchCounts();
    } catch {
      // no-op - non-critical
    }
  };

  const layoutMap = {
    [ROLE.ADMIN]: AdminLayout,
    [ROLE.STAFF]: StaffLayout,
    [ROLE.CUSTOMER]: CustomerLayout,
  };
  const Layout = layoutMap[role] || CustomerLayout;

  return (
    <Layout title="Notifications">
      <NotificationsCenterView
        isAdmin={isAdmin}
        notifications={notifications}
        counts={counts}
        loading={loading}
        loadFailed={loadFailed}
        tab={view.tab}
        sort={view.sort}
        unreadOnly={view.unread}
        needs={{ status: needs.status, data: needs.data, onRetry: needs.retry }}
        onTab={(tab) => changeView({ tab })}
        onSort={(sort) => changeView({ sort })}
        onUnreadOnly={(unread) => changeView({ unread })}
        onOpen={handleNotificationClick}
        onMarkAll={handleMarkAllRead}
        onRetry={fetchNotifications}
      />
    </Layout>
  );
}

export default NotificationsPage;
