import { useRef } from 'react';
import { CATEGORY_LABEL, categoryOf } from '../constants/notificationCategories';
import { NEEDS_ACTION_TAB, categoryCounts, groupByDate, inCategory, timeAgo, visibleCategories } from '../utils/notificationGroups';
import { buildNeedsActionRows } from '../utils/needsAction';
import { NeedsActionRows } from './needs_action_rows';

// The body of the notifications page, as props in and markup out (the page fetches and navigates), so it can be shown in every state without a
// server. Tabs: for an admin "Needs action" first, then All and one per category that has a notification. Under a tab the notifications are
// grouped Today, Yesterday, Earlier. Needs action is the live list of open tasks, not notifications, so it has no read state.
const tabId = (key) => `notif-tab-${key}`;
const PANEL_ID = 'notif-tabpanel';

function Tabs({ tabs, selected, onTab }) {
  const tabRefs = useRef({});
  // arrows, Home and End move between tabs and the tab you land on is selected (the tab list is one stop in the tab order)
  const handleKeyDown = (event) => {
    const index = tabs.findIndex((t) => t.key === selected);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onTab(tabs[next].key);
    const target = tabs[next].key;
    requestAnimationFrame(() => tabRefs.current[target]?.focus());
  };

  return (
    <div className="notif-tabs" role="tablist" aria-label="Notification categories" onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const active = tab.key === selected;
        return (
          <button
            key={tab.key}
            id={tabId(tab.key)}
            ref={(el) => { tabRefs.current[tab.key] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={PANEL_ID}
            tabIndex={active ? 0 : -1}
            className={`notif-tab ${active ? 'notif-tab--active' : ''}`}
            onClick={() => onTab(tab.key)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="notif-tab-count" aria-label={`${tab.count} ${tab.countLabel}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function NotificationList({ notifications, onOpen, now, showCategory }) {
  return groupByDate(notifications, now).map((group) => (
    <section className="notif-date-group" key={group.key} aria-labelledby={`notif-date-${group.key}`}>
      <h3 className="notif-date-title" id={`notif-date-${group.key}`}>{group.title}</h3>
      <div className="notif-page-list">
        {group.items.map((n) => (
          <button
            key={n._id}
            type="button"
            className={`notif-item notif-page-item ${!n.read ? 'unread' : ''}`}
            onClick={() => onOpen(n)}
          >
            <div className="notif-item-row">
              <span className={`notif-item-dot ${n.read ? 'read' : ''}`} />
              <div>
                <p className="notif-item-message">{n.message}</p>
                <p className="notif-item-time">
                  {showCategory && <span className="notif-item-category">{CATEGORY_LABEL[categoryOf(n.type)]}{' · '}</span>}
                  {timeAgo(n.createdAt)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  ));
}

function NeedsActionPanel({ needs }) {
  const { status, data, onRetry } = needs;
  if (!data && status === 'error') {
    return (
      <div className="notif-page-empty" role="alert">
        Could not load what needs action.
        <button type="button" className="notif-mark-all-btn notif-page-retry" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (!data) return <div className="notif-page-empty">Loading what needs action...</div>;
  const { rows } = buildNeedsActionRows(data);
  if (rows.length === 0) return <div className="notif-page-empty">All caught up. Nothing needs action right now.</div>;
  return <div className="notif-page-list nr-panel"><NeedsActionRows rows={rows} /></div>;
}

export function NotificationsCenterView({
  isAdmin = false, notifications = [], loading = false, loadFailed = false, tab = 'all', needs = { status: 'idle', data: null },
  onTab = () => {}, onOpen = () => {}, onMarkAll = () => {}, onRetry = () => {}, now = new Date(),
}) {
  const counts = categoryCounts(notifications);
  const bookingCount = buildNeedsActionRows(needs.data).bookingCount;
  const tabs = [
    ...(isAdmin ? [{ key: NEEDS_ACTION_TAB, label: 'Needs action', count: bookingCount, countLabel: 'bookings need action' }] : []),
    { key: 'all', label: 'All', count: counts.all.unread, countLabel: 'unread' },
    ...visibleCategories(counts, tab).map((key) => ({ key, label: CATEGORY_LABEL[key], count: counts.byCategory[key]?.unread || 0, countLabel: 'unread' })),
  ];
  const selected = tabs.some((t) => t.key === tab) ? tab : 'all';
  const onNeeds = selected === NEEDS_ACTION_TAB;
  const shown = onNeeds ? [] : inCategory(notifications, selected);
  const unreadHere = onNeeds ? 0 : (selected === 'all' ? counts.all.unread : counts.byCategory[selected]?.unread || 0);
  const heading = onNeeds ? 'Needs action' : selected === 'all' ? 'All notifications' : CATEGORY_LABEL[selected];

  let body;
  if (onNeeds) {
    body = <NeedsActionPanel needs={{ onRetry: () => {}, ...needs }} />;
  } else if (loading) {
    body = <div className="notif-page-empty">Loading notifications...</div>;
  } else if (loadFailed) {
    body = (
      <div className="notif-page-empty" role="alert">
        Could not load notifications.
        <button type="button" className="notif-mark-all-btn notif-page-retry" onClick={onRetry}>Retry</button>
      </div>
    );
  } else if (notifications.length === 0) {
    body = <div className="notif-page-empty">No notifications yet.</div>;
  } else if (shown.length === 0) {
    body = <div className="notif-page-empty">No notifications in {heading}.</div>;
  } else {
    body = <NotificationList notifications={shown} onOpen={onOpen} now={now} showCategory={selected === 'all'} />;
  }

  return (
    <div className="notif-page">
      <div className="notif-page-header">
        <h2 className="notif-page-title">{heading}</h2>
        {unreadHere > 0 && (
          <button
            type="button"
            className="notif-mark-all-btn"
            onClick={() => onMarkAll(selected)}
            aria-label={selected === 'all' ? 'Mark all as read' : `Mark all ${heading} as read`}
          >
            Mark all as read
          </button>
        )}
      </div>

      {(isAdmin || (!loading && !loadFailed && notifications.length > 0)) && <Tabs tabs={tabs} selected={selected} onTab={onTab} />}

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(selected)} tabIndex={-1}>
        {body}
      </div>
    </div>
  );
}
