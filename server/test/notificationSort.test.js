'use strict';
// Run with: npm test (inside server/). The notifications page sort order, the Unread only switch, how they combine with the category tabs and the
// date groups, the view kept in the address and the session, and the exact tab counts. The real components are rendered to markup (no browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
const React = fromRoot('react');
const { renderToStaticMarkup } = fromRoot('react-dom/server');
const { MemoryRouter } = fromRoot('react-router-dom');

let vite;
let close;
let view;
test.before(async () => {
  ({ vite, close } = await startSsrServer());
  view = await vite.ssrLoadModule('/src/utils/notificationView.js');
});
test.after(async () => { if (close) await close(); });
test.afterEach(() => { delete global.sessionStorage; });

// Thursday 5 Nov 2026, local noon
const NOW = new Date(2026, 10, 5, 12, 0, 0);
const at = (daysAgo, hour) => new Date(2026, 10, 5 - daysAgo, hour, 0, 0).toISOString();
const note = (n, type, createdAt, read = false) => ({ _id: `N${n}`, type, message: `Message ${n}`, read, createdAt });

// today 11:00 read, today 09:00 unread, yesterday 15:00 unread, yesterday 08:00 read, 4 days ago 10:00 unread, 6 days ago 10:00 read
const LIST = [
  note(1, 'payment_verified', at(0, 11), true),
  note(2, 'payment_submitted', at(0, 9)),
  note(3, 'booking_new', at(1, 15)),
  note(4, 'booking_approved', at(1, 8), true),
  note(5, 'chat_message', at(4, 10)),
  note(6, 'payment_rejected', at(6, 10), true),
];

const render = async (props) => {
  const { NotificationsCenterView } = await vite.ssrLoadModule('/src/components/notifications_center.jsx');
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(NotificationsCenterView, { now: NOW, notifications: LIST, ...props })));
};
const order = (html) => [...html.matchAll(/Message (\d+)</g)].map((m) => Number(m[1]));
const heads = (html) => [...html.matchAll(/<h3 class="notif-date-title"[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
const ids = (list) => list.map((n) => Number(n._id.slice(1)));
const params = (query) => new URLSearchParams(query);

// ---- the sort orders -----------------------------------------------------------------------------------------------------------------

test('Newest first is the default and puts the latest on top', () => {
  assert.deepEqual(ids(view.sortNotifications(LIST)), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ids(view.sortNotifications(LIST, 'newest')), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ids(view.sortNotifications([...LIST].reverse(), 'newest')), [1, 2, 3, 4, 5, 6], 'whatever order it arrives in');
});

test('Oldest first reverses it', () => {
  assert.deepEqual(ids(view.sortNotifications(LIST, 'oldest')), [6, 5, 4, 3, 2, 1]);
});

test('Unread first puts the unread on top, each part newest first', () => {
  assert.deepEqual(ids(view.sortNotifications(LIST, 'unread')), [2, 3, 5, 1, 4, 6]);
});

test('sorting never changes the list it is given, an unknown order is Newest first, and equal times keep their order', () => {
  const copy = JSON.parse(JSON.stringify(LIST));
  view.sortNotifications(LIST, 'oldest');
  assert.deepEqual(LIST, copy);
  assert.deepEqual(ids(view.sortNotifications(LIST, 'sideways')), [1, 2, 3, 4, 5, 6]);
  const same = [note(1, 'chat_message', at(0, 9)), note(2, 'chat_message', at(0, 9)), note(3, 'chat_message', at(0, 9))];
  for (const sort of ['newest', 'oldest', 'unread']) assert.deepEqual(ids(view.sortNotifications(same, sort)), [1, 2, 3], sort);
  assert.deepEqual(ids(view.sortNotifications([note(1, 'chat_message', 'not a date'), note(2, 'chat_message', at(0, 9))], 'newest')), [2, 1], 'a bad date sorts last');
});

test('the page shows the notifications in the chosen order', async () => {
  assert.deepEqual(order(await render({})), [1, 2, 3, 4, 5, 6], 'default');
  assert.deepEqual(order(await render({ sort: 'newest' })), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(order(await render({ sort: 'oldest' })), [6, 5, 4, 3, 2, 1]);
});

test('Oldest first turns the day groups round too: Earlier, Yesterday, Today', async () => {
  assert.deepEqual(heads(await render({ sort: 'newest' })), ['Today', 'Yesterday', 'Earlier']);
  assert.deepEqual(heads(await render({ sort: 'oldest' })), ['Earlier', 'Yesterday', 'Today']);
  assert.deepEqual(heads(await render({ sort: 'unread' })), ['Today', 'Yesterday', 'Earlier']);
});

test('Unread first puts the unread on top within each day group, newest first', async () => {
  // Today: 2 (unread) then 1 (read). Yesterday: 3 (unread) then 4 (read). Earlier: 5 (unread) then 6 (read).
  assert.deepEqual(order(await render({ sort: 'unread' })), [2, 1, 3, 4, 5, 6]);
});

// ---- Unread only ---------------------------------------------------------------------------------------------------------------------

test('Unread only shows the unread ones and nothing else, in the chosen order', async () => {
  assert.deepEqual(order(await render({ unreadOnly: true })), [2, 3, 5]);
  assert.deepEqual(order(await render({ unreadOnly: true, sort: 'oldest' })), [5, 3, 2]);
  assert.deepEqual(order(await render({ unreadOnly: true, sort: 'unread' })), [2, 3, 5]);
  assert.deepEqual(heads(await render({ unreadOnly: true })), ['Today', 'Yesterday', 'Earlier']);
  assert.deepEqual(order(await render({ unreadOnly: false })), [1, 2, 3, 4, 5, 6]);
});

test('Unread only drops a day group that has no unread left', async () => {
  const onlyEarlier = [note(1, 'chat_message', at(0, 9), true), note(2, 'chat_message', at(5, 9))];
  assert.deepEqual(heads(await render({ notifications: onlyEarlier, unreadOnly: true })), ['Earlier']);
});

test('the switch says whether it is on, and the select says which order is chosen', async () => {
  const off = await render({});
  assert.match(off, /<button type="button" role="switch" aria-checked="false" class="notif-unread-toggle ">/);
  const on = await render({ unreadOnly: true, sort: 'oldest' });
  assert.match(on, /role="switch" aria-checked="true" class="notif-unread-toggle notif-unread-toggle--on"/);
  assert.match(on, /<option value="oldest" selected="">Oldest first<\/option>/);
  assert.match(off, /<option value="newest" selected="">Newest first<\/option><option value="oldest">Oldest first<\/option><option value="unread">Unread first<\/option>/);
  assert.match(on, /Unread only<\/button>/);
});

// ---- together with the category tabs ---------------------------------------------------------------------------------------------------

test('sort and Unread only work inside the selected category', async () => {
  // Payments are 1 (read), 2 (unread), 6 (read, earlier)
  assert.deepEqual(order(await render({ tab: 'payments' })), [1, 2, 6]);
  assert.deepEqual(order(await render({ tab: 'payments', sort: 'oldest' })), [6, 2, 1]);
  assert.deepEqual(order(await render({ tab: 'payments', sort: 'unread' })), [2, 1, 6]);
  assert.deepEqual(order(await render({ tab: 'payments', unreadOnly: true })), [2]);
  // Bookings are 3 (unread, yesterday) and 4 (read, yesterday)
  assert.deepEqual(order(await render({ tab: 'bookings', sort: 'unread' })), [3, 4]);
  assert.deepEqual(order(await render({ tab: 'bookings', sort: 'unread', unreadOnly: true })), [3]);
  assert.deepEqual(heads(await render({ tab: 'bookings', sort: 'oldest' })), ['Yesterday']);
});

test('an empty result says so for the selected category and for Unread only', async () => {
  assert.match(await render({ tab: 'chat', notifications: LIST.map((n) => ({ ...n, read: true })), unreadOnly: true }), /No unread notifications in Chat\./);
  assert.match(await render({ notifications: LIST.map((n) => ({ ...n, read: true })), unreadOnly: true }), /No unread notifications\./);
  assert.match(await render({ tab: 'units' }), /No notifications in Units\./);
});

test('the controls are under the tabs, and not on Needs action or while there is nothing to sort', async () => {
  const html = await render({});
  assert.ok(html.indexOf('role="tablist"') < html.indexOf('class="notif-controls"') && html.indexOf('class="notif-controls"') < html.indexOf('role="tabpanel"'));
  const needs = { status: 'ready', data: { groups: { today: { items: [], count: 0 }, decision: { items: [], count: 0 }, money: { items: [], count: 0 } } } };
  assert.doesNotMatch(await render({ isAdmin: true, tab: 'needs-action', needs }), /notif-controls/);
  assert.doesNotMatch(await render({ notifications: [] }), /notif-controls/);
  assert.doesNotMatch(await render({ loading: true }), /notif-controls/);
  assert.doesNotMatch(await render({ loadFailed: true }), /notif-controls/);
});

// ---- for each role -------------------------------------------------------------------------------------------------------------------

test('customer, technician and admin all get the sort and the switch; only the admin has Needs action', async () => {
  for (const [role, isAdmin] of [['customer', false], ['staff', false], ['admin', true]]) {
    const html = await render({ isAdmin, sort: 'unread', unreadOnly: true });
    assert.match(html, /class="notif-sort-select"/, role);
    assert.match(html, /role="switch" aria-checked="true"/, role);
    assert.deepEqual(order(html), [2, 3, 5], role);
    assert.equal(/Needs action/.test(html), isAdmin, role);
  }
});

test('the page is one component for every role, and reads the view from the address and the session', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'notifications.jsx'), 'utf8');
  assert.match(page, /resolveView\(searchParams, readSession\(\), isAdmin\)/);
  assert.match(page, /saveSession\(next\)/);
  assert.match(page, /setSearchParams\(viewToParams\(next\), \{ replace: true \}\)/);
  for (const layout of ['AdminLayout', 'StaffLayout', 'CustomerLayout']) assert.match(page, new RegExp(layout));
});

// ---- the address and the session -----------------------------------------------------------------------------------------------------

test('the view is read from ?category=, ?sort= and ?unread=', () => {
  assert.deepEqual(view.resolveView(params('category=payments&sort=unread&unread=1')), { tab: 'payments', sort: 'unread', unread: true });
  assert.deepEqual(view.resolveView(params('')), { tab: 'all', sort: 'newest', unread: false });
  assert.deepEqual(view.resolveView(params('sort=oldest')), { tab: 'all', sort: 'oldest', unread: false });
  assert.deepEqual(view.resolveView(params('unread=0&sort=newest&category=all')), { tab: 'all', sort: 'newest', unread: false });
});

test('a bad value in the address is ignored, not trusted', () => {
  assert.deepEqual(view.resolveView(params('category=nope&sort=sideways&unread=yes')), { tab: 'all', sort: 'newest', unread: false });
  assert.deepEqual(view.resolveView(params('category=__proto__&sort=__proto__')), { tab: 'all', sort: 'newest', unread: false });
  assert.deepEqual(view.resolveView(params('category=payments&category=chat')), { tab: 'payments', sort: 'newest', unread: false });
});

test('Needs action is in the address for an admin only, as ?category= or the older ?tab=', () => {
  assert.equal(view.resolveView(params('category=needs-action'), {}, true).tab, 'needs-action');
  assert.equal(view.resolveView(params('tab=needs-action'), {}, true).tab, 'needs-action');
  for (const query of ['category=needs-action', 'tab=needs-action']) assert.equal(view.resolveView(params(query), {}, false).tab, 'all', `${query} for a customer or technician`);
  assert.equal(view.resolveView(params(''), { tab: 'needs-action' }, false).tab, 'all', 'not even from the session');
  assert.equal(view.resolveView(params('tab=payments')).tab, 'payments', 'the older ?tab= still opens a category');
  assert.equal(view.resolveView(params('category=chat&tab=payments')).tab, 'chat', '?category= wins');
});

test('the address only holds what differs from the default', () => {
  assert.deepEqual(view.viewToParams({ tab: 'all', sort: 'newest', unread: false }), {});
  assert.deepEqual(view.viewToParams({ tab: 'payments', sort: 'unread', unread: true }), { category: 'payments', sort: 'unread', unread: '1' });
  assert.deepEqual(view.viewToParams({ tab: 'all', sort: 'oldest', unread: false }), { sort: 'oldest' });
  assert.deepEqual(view.viewToParams({ tab: 'needs-action', sort: 'newest', unread: false }), { category: 'needs-action' });
  const view1 = { tab: 'refunds', sort: 'oldest', unread: true };
  assert.deepEqual(view.resolveView(new URLSearchParams(view.viewToParams(view1))), view1, 'what is written is read back');
});

test('the session fills in what the address leaves out, and the address wins where it speaks', () => {
  const stored = { tab: 'payments', sort: 'oldest', unread: true };
  assert.deepEqual(view.resolveView(params(''), stored), stored);
  assert.deepEqual(view.resolveView(params('sort=unread'), stored), { tab: 'payments', sort: 'unread', unread: true });
  assert.deepEqual(view.resolveView(params('category=chat&unread=0'), stored), { tab: 'chat', sort: 'oldest', unread: false });
  assert.deepEqual(view.resolveView(params(''), { tab: 'bogus', sort: 'bogus', unread: 'yes' }), { tab: 'all', sort: 'newest', unread: false }, 'a damaged session is ignored');
});

test('the view is remembered for the session, and a browser that will not store it does no harm', () => {
  const store = {};
  global.sessionStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  assert.deepEqual(view.readSession(), {});
  view.saveSession({ tab: 'chat', sort: 'oldest', unread: true, extra: 'ignored' });
  assert.deepEqual(JSON.parse(store[view.SESSION_KEY]), { tab: 'chat', sort: 'oldest', unread: true });
  assert.deepEqual(view.resolveView(params(''), view.readSession()), { tab: 'chat', sort: 'oldest', unread: true });
  global.sessionStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(view.readSession(), {});
  assert.doesNotThrow(() => view.saveSession({ tab: 'all', sort: 'newest', unread: false }));
  store[view.SESSION_KEY] = '{not json';
  global.sessionStorage = { getItem: (k) => store[k], setItem() {} };
  assert.deepEqual(view.readSession(), {});
});

// ---- accessibility -------------------------------------------------------------------------------------------------------------------

test('a screen reader is told how many are shown, in which order and with which filter, through a polite live region', async () => {
  assert.match(await render({}), /<p class="notif-sr" role="status" aria-live="polite">6 notifications, newest first\.<\/p>/);
  assert.match(await render({ sort: 'unread', unreadOnly: true, tab: 'payments' }), /1 notification, unread first, unread only, Payments\./);
  assert.match(await render({ sort: 'oldest', tab: 'bookings' }), /2 notifications, oldest first, Bookings\./);
  assert.match(await render({ isAdmin: true, tab: 'needs-action' }), /<p class="notif-sr" role="status" aria-live="polite"><\/p>/);
});

test('the controls are real form controls with a visible label, and the phone rules keep them on one line at 44 px', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'css', 'components', 'notification_bell.css'), 'utf8');
  assert.match(css, /\.notif-sort-select \{[^}]*min-height: 44px/);
  assert.match(css, /\.notif-unread-toggle \{[^}]*min-height: 44px/);
  assert.match(css, /\.notif-controls \{[^}]*display: flex[^}]*align-items: center/);
  assert.doesNotMatch(css, /\.notif-controls \{[^}]*flex-wrap: wrap/, 'one line');
});

// ---- the tab counts when there are more than 200 notifications --------------------------------------------------------------------------

test('the tab counts come from the server totals, so they are right even when the list holds only 200', async () => {
  const rows = [
    { type: 'payment_submitted', total: 300, unread: 120 },
    { type: 'booking_new', total: 150, unread: 5 },
    { type: 'chat_message', total: 10, unread: 0 },
  ];
  const html = await render({ counts: rows });
  const count = (label) => Number((html.match(new RegExp(`>${label}<span class="notif-tab-count" aria-label="(\\d+) `)) || [])[1] || 0);
  assert.equal(count('All'), 125, 'the unread of all 460, not of the 6 loaded');
  assert.equal(count('Payments'), 120);
  assert.equal(count('Bookings'), 5);
  assert.match(html, /Showing the newest 6 of 460\./);
  assert.match(await render({ counts: rows, tab: 'payments' }), /Showing the newest 3 of 300\./);
  assert.match(await render({ counts: rows, tab: 'payments' }), /aria-label="Mark all Payments as read"/, 'Mark all is offered for the 120, not only the loaded ones');
});

test('with no server counts the tabs count the loaded list, and no "newest" note is shown when nothing is missing', async () => {
  const html = await render({ counts: null });
  assert.match(html, />All<span class="notif-tab-count" aria-label="3 unread">/);
  assert.doesNotMatch(html, /Showing the newest/);
  const exact = LIST.map((n) => ({ type: n.type, total: 1, unread: n.read ? 0 : 1 }));
  assert.doesNotMatch(await render({ counts: exact }), /Showing the newest/);
});

test('countsFromTypes adds the kinds up per category and ignores nothing', async () => {
  const groups = await vite.ssrLoadModule('/src/utils/notificationGroups.js');
  const counts = groups.countsFromTypes([
    { type: 'refund_requested', total: 4, unread: 1 }, { type: 'refund_processed', total: 2, unread: 2 }, { type: 'brand_new_kind', total: 3, unread: 3 },
  ]);
  assert.deepEqual(counts.byCategory.refunds, { total: 6, unread: 3 });
  assert.deepEqual(counts.byCategory.other, { total: 3, unread: 3 });
  assert.deepEqual(counts.all, { total: 9, unread: 6 });
  assert.deepEqual(groups.countsFromTypes([]), { all: { total: 0, unread: 0 }, byCategory: {} });
});
