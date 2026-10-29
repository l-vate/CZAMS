import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import AdminLayout from './admin/admin_layout';
import CustomerLayout from './customer/customer_layout';
import StaffLayout from './staff/staff_layout';
import { NotificationsCenterView } from '../components/notifications_center';
import { CATEGORY_ORDER, readFilterFor } from '../constants/notificationCategories';
import { ROLE } from '../constants/roles';
import { useNeedsAttention } from '../hooks/useNeedsAttention';
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
import { NEEDS_ACTION_TAB, markCategoryRead } from '../utils/notificationGroups';

// The page asks for more than the bell's newest 30, so the counts on the tabs cover a useful stretch of history.
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
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const role = getStoredUserRole();
  const isAdmin = role === ROLE.ADMIN;
  const needs = useNeedsAttention();

  // the tab is in the address (?tab=bookings), so a link can open it and the back button keeps it; Needs action is for an admin only
  const asked = searchParams.get('tab');
  const tab = asked === NEEDS_ACTION_TAB ? (isAdmin ? NEEDS_ACTION_TAB : 'all') : (CATEGORY_ORDER.includes(asked) ? asked : 'all');
  const handleTab = (next) => setSearchParams(next === 'all' ? {} : { tab: next }, { replace: true });

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await listNotifications(PAGE_LIMIT);
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
        loading={loading}
        loadFailed={loadFailed}
        tab={tab}
        needs={{ status: needs.status, data: needs.data, onRetry: needs.retry }}
        onTab={handleTab}
        onOpen={handleNotificationClick}
        onMarkAll={handleMarkAllRead}
        onRetry={fetchNotifications}
      />
    </Layout>
  );
}

export default NotificationsPage;
