import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiMenu, FiX, FiMessageCircle, FiSearch } from 'react-icons/fi';
import Sidebar from '../../components/sidebars/admin_sidebar';
import NotificationBell from '../../components/notification_bell';
import { listConversations } from '../../services/chatService';

import { adminNotificationTarget } from '../../utils/notificationTarget';
import { useNeedsAttention } from '../../hooks/useNeedsAttention';
import { needsActionCount } from '../../utils/needsAction';
// Search moved here (topbar), same pattern as the customer portal - pages that
// need search pass searchValue/onSearchChange/searchPlaceholder in and get the
// topbar box; pages that don't just omit those props and get nothing.
function AdminLayout({ title, children, searchValue, onSearchChange, searchPlaceholder }) {
  // the bell carries how many bookings need action (the same shared answer as the Needs action tab)
  const needs = useNeedsAttention();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // On a phone (up to 768 px) the search box folds into an icon; this opens it full width over the top bar. Wider screens ignore it.
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
  const { pathname } = useLocation();
  // How many customer conversations have a message this admin has not read yet: shown on the chat icon. Checked on every page change and
  // then every 20 seconds, the same way the chat page itself refreshes.
  const [unreadChats, setUnreadChats] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const check = () => listConversations()
      .then((list) => { if (!cancelled && Array.isArray(list)) setUnreadChats(list.filter((c) => c.unread).length); })
      .catch(() => {});
    check();
    const timer = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pathname]);

  const handleNotificationClick = (notification) => {
    const target = adminNotificationTarget(notification);
    if (target) navigate(target);
  };

  return (
    <div className={`dashboard-shell admin-dashboard-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
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
                    aria-label={(searchPlaceholder || 'Search').replace(/\.{3}$/, '')}
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape' && searchOpen) closeSearch(); }}
                  />
                  <button type="button" className="topbar-search-close" onClick={closeSearch} aria-label="Close search">
                    <FiX />
                  </button>
                </div>
              </>
            )}
            {/* Chat is now reached from here rather than a permanent sidebar
                tab - this is the one access point, on every admin page, into
                the conversation inbox. */}
            <button
              type="button"
              className="topbar-support-btn"
              onClick={() => navigate('/admin/chat')}
              aria-label={unreadChats > 0 ? `Chat, ${unreadChats} unread` : 'Chat'}
              title="Chat"
            >
              <FiMessageCircle />
              {unreadChats > 0 && <span className="topbar-chat-badge" aria-hidden="true">{unreadChats > 9 ? '9+' : unreadChats}</span>}
            </button>
            <NotificationBell
              onNotificationClick={handleNotificationClick}
              viewAllRoute="/admin/notifications"
              actionCount={needsActionCount(needs.data)}
              actionRoute="/admin/notifications?tab=needs-action"
            />
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