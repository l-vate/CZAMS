'use strict';
// Run with: npm test (inside server/). E20 follow-up: the notifications page with category tabs, date groups, mark all as read per category and,
// for an admin, the Needs action tab. The real components are rendered to markup (no browser, no server).
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
test.before(async () => { ({ vite, close } = await startSsrServer()); });
test.after(async () => { if (close) await close(); });

// a fixed "now": Thursday 5 Nov 2026, local noon
const NOW = new Date(2026, 10, 5, 12, 0, 0);
const at = (daysAgo, hour = 9) => new Date(2026, 10, 5 - daysAgo, hour, 0, 0).toISOString();
const note = (n, type, over = {}) => ({ _id: `N${n}`, type, message: `Message ${n}`, read: false, createdAt: at(0), relatedBookingId: null, ...over });

const need = (over) => ({
  id: `k:${over.bookingId}`, kind: 'pending_approval', bookingId: 'CZ-2026-1001', customerName: 'Ana Cruz', label: 'Waiting for approval', date: '2026-11-20',
  waitingSince: '2026-11-03T00:00:00.000Z', waitingMinutes: 180, waitingDays: 0, urgency: 'waiting', link: `/admin/services/requests/${over.bookingId}`, ...over,
});
const answer = (groups) => {
  const full = { today: { items: [], count: 0 }, decision: { items: [], count: 0 }, money: { items: [], count: 0 }, ...groups };
  return { generatedAt: '2026-11-05T04:00:00.000Z', today: '2026-11-05', total: full.today.count + full.decision.count, groups: full };
};
const grp = (items) => ({ items, count: items.length });

const render = async (props) => {
  const { NotificationsCenterView } = await vite.ssrLoadModule('/src/components/notifications_center.jsx');
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(NotificationsCenterView, { now: NOW, ...props })));
};
const tabLabels = (html) => [...html.matchAll(/role="tab"[^>]*>([^<]*)(?:<span|<\/button>)/g)].map((m) => m[1]);
const countOn = (html, label) => {
  const m = html.match(new RegExp(`>${label}<span class="notif-tab-count" aria-label="(\\d+) [^"]*">`));
  return m ? Number(m[1]) : 0;
};

const MIXED = [
  note(1, 'booking_approved'), note(2, 'booking_cancelled', { read: true }), note(3, 'payment_verified'),
  note(4, 'refund_requested', { createdAt: at(1) }), note(5, 'chat_message', { createdAt: at(1) }), note(6, 'job_assigned', { createdAt: at(4) }),
];

test('tabs: All first and then one per category that has a notification, in a fixed order, with unread counts', async () => {
  const html = await render({ notifications: MIXED });
  assert.deepEqual(tabLabels(html), ['All', 'Bookings', 'Payments', 'Refunds', 'Jobs and reports', 'Chat']);
  assert.equal(countOn(html, 'All'), 5, '6 notifications, one read');
  assert.equal(countOn(html, 'Bookings'), 1, 'two bookings notifications, one read');
  assert.equal(countOn(html, 'Payments'), 1);
  assert.equal(countOn(html, 'Chat'), 1);
  assert.doesNotMatch(html, /Units|Account|>Other</, 'no tab for a category with nothing in it');
});

test('a tab has no count when everything in it is read, and the selected tab shows only its own notifications', async () => {
  const html = await render({ notifications: MIXED, tab: 'bookings' });
  assert.equal(countOn(html, 'Payments'), 1);
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Bookings/);
  assert.match(html, /Message 1/);
  assert.match(html, /Message 2/);
  assert.doesNotMatch(html, /Message 3|Message 5/);
  assert.match(html, /<h2 class="notif-page-title">Bookings<\/h2>/);
  const allRead = await render({ notifications: MIXED.map((n) => ({ ...n, read: true })) });
  assert.doesNotMatch(allRead, /notif-tab-count/);
});

test('an unknown kind lands on an Other tab', async () => {
  const html = await render({ notifications: [note(1, 'brand_new_kind'), note(2, 'chat_message')] });
  assert.deepEqual(tabLabels(html), ['All', 'Chat', 'Other']);
  assert.match(await render({ notifications: [note(1, 'brand_new_kind')], tab: 'other' }), /Message 1/);
});

test('notifications are grouped Today, Yesterday, Earlier, newest first, and an empty group has no heading', async () => {
  const html = await render({ notifications: MIXED });
  const heads = [...html.matchAll(/<h3 class="notif-date-title"[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['Today', 'Yesterday', 'Earlier']);
  assert.ok(html.indexOf('Message 1') < html.indexOf('Message 4') && html.indexOf('Message 4') < html.indexOf('Message 6'));
  const onlyToday = await render({ notifications: [note(1, 'chat_message')] });
  assert.deepEqual([...onlyToday.matchAll(/<h3 class="notif-date-title"[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]), ['Today']);
});

test('the date groups follow the viewer calendar day, including just after midnight', async () => {
  const { dateGroupOf } = await vite.ssrLoadModule('/src/utils/notificationGroups.js');
  const now = new Date(2026, 10, 5, 0, 10);
  assert.equal(dateGroupOf(new Date(2026, 10, 5, 0, 1).toISOString(), now), 'today');
  assert.equal(dateGroupOf(new Date(2026, 10, 4, 23, 59).toISOString(), now), 'yesterday');
  assert.equal(dateGroupOf(new Date(2026, 10, 3, 23, 59).toISOString(), now), 'earlier');
  assert.equal(dateGroupOf('not a date', now), 'earlier');
});

test('every notification is still a button with the same look and message, unread ones marked', async () => {
  const html = await render({ notifications: [note(1, 'booking_approved'), note(2, 'booking_cancelled', { read: true })] });
  assert.match(html, /<button type="button" class="notif-item notif-page-item unread"/);
  assert.match(html, /<button type="button" class="notif-item notif-page-item "/);
  assert.match(html, /<p class="notif-item-message">Message 1<\/p>/);
  assert.match(html, /notif-item-category">Bookings/, 'All shows which category each one is in');
  assert.doesNotMatch(await render({ notifications: [note(1, 'booking_approved')], tab: 'bookings' }), /notif-item-category/);
});

test('Mark all as read is offered for the selected tab only while it has unread ones, and says which', async () => {
  const all = await render({ notifications: MIXED });
  assert.match(all, /<button type="button" class="notif-mark-all-btn" aria-label="Mark all as read">/);
  const bookings = await render({ notifications: MIXED, tab: 'bookings' });
  assert.match(bookings, /aria-label="Mark all Bookings as read"/);
  const read = MIXED.map((n) => (n.type === 'booking_approved' || n.type === 'booking_cancelled' ? { ...n, read: true } : n));
  assert.doesNotMatch(await render({ notifications: read, tab: 'bookings' }), /notif-mark-all-btn/, 'nothing unread in Bookings');
  assert.match(await render({ notifications: read }), /notif-mark-all-btn/, 'but All still has unread ones');
});

test('mark all as read for a category changes only that category, and All changes every one', async () => {
  const { markCategoryRead } = await vite.ssrLoadModule('/src/utils/notificationGroups.js');
  const { readFilterFor } = await vite.ssrLoadModule('/src/constants/notificationCategories.js');
  const afterPayments = markCategoryRead(MIXED, 'payments');
  assert.deepEqual(afterPayments.filter((n) => n.read).map((n) => n._id), ['N2', 'N3']);
  assert.equal(MIXED.find((n) => n._id === 'N3').read, false, 'the input is not changed');
  assert.deepEqual(markCategoryRead(MIXED, 'all').filter((n) => !n.read), []);
  const unknown = [note(1, 'brand_new_kind'), note(2, 'chat_message')];
  assert.deepEqual(markCategoryRead(unknown, 'other').map((n) => n.read), [true, false]);
  assert.deepEqual(readFilterFor('payments').types.sort(), ['charge_updated', 'discount_approved', 'discount_rejected', 'discount_requested', 'payment_due', 'payment_rejected', 'payment_submitted', 'payment_verified', 'quotation_updated']);
});

test('the page wires the buttons to the server with the category filter, and keeps the click behaviour', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'notifications.jsx'), 'utf8');
  assert.match(page, /markAllNotificationsRead\(readFilterFor\(category === 'all' \? null : category\)\)/);
  assert.match(page, /markNotificationRead\(notification\._id\)/);
  assert.match(page, /adminNotificationTarget\(notification\)[\s\S]*technicianNotificationTarget\(notification\)[\s\S]*customerNotificationTarget\(notification\)/);
  assert.match(page, /listNotifications\(PAGE_LIMIT\)/);
});

test('tab markup is accessible: a tablist with labelled tabs, one tab stop, and a tabpanel tied to the selected tab', async () => {
  const html = await render({ notifications: MIXED, tab: 'payments' });
  assert.match(html, /role="tablist" aria-label="Notification categories"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 6);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 1, 'only the selected tab is in the tab order');
  assert.match(html, /id="notif-tab-payments" type="button" role="tab" aria-selected="true" aria-controls="notif-tabpanel" tabindex="0"/);
  assert.match(html, /role="tabpanel" aria-labelledby="notif-tab-payments"/);
  const src = fs.readFileSync(path.join(root, 'src', 'components', 'notifications_center.jsx'), 'utf8');
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.match(src, new RegExp(`'${key}'`), `${key} moves between tabs`);
});

test('states: loading, failed (with Retry), nothing yet, and nothing in the selected category', async () => {
  assert.match(await render({ loading: true }), /Loading notifications\.\.\./);
  const failed = await render({ loadFailed: true });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Retry/);
  assert.match(await render({ notifications: [] }), /No notifications yet\./);
  assert.match(await render({ notifications: MIXED, tab: 'units' }), /No notifications in Units\./);
});

// ---- Needs action (admin only) -------------------------------------------------------------------------------------------------------

test('Needs action is the first tab for an admin only, and never for another role', async () => {
  const admin = await render({ isAdmin: true, notifications: MIXED, needs: { status: 'ready', data: answer({ decision: grp([need({ bookingId: 'CZ-2026-1001' })]) }) } });
  assert.deepEqual(tabLabels(admin).slice(0, 2), ['Needs action', 'All']);
  for (const isAdmin of [false, undefined]) {
    const other = await render({ isAdmin, notifications: MIXED, tab: 'needs-action', needs: { status: 'ready', data: answer({ decision: grp([need({ bookingId: 'CZ-2026-1001' })]) }) } });
    assert.doesNotMatch(other, /Needs action/);
    assert.doesNotMatch(other, /CZ-2026-1001/, 'not even if the address asks for it');
    assert.match(other, /role="tab"[^>]*aria-selected="true"[^>]*>All/);
  }
});

test('the Needs action count is the number of bookings, not of reasons, and it is not marked read', async () => {
  const data = answer({
    today: grp([need({ bookingId: 'CZ-2026-1001', kind: 'today_pending', urgency: 'today' })]),
    decision: grp([need({ bookingId: 'CZ-2026-1001', kind: 'discount_review' }), need({ bookingId: 'CZ-2026-1002' })]),
    money: grp([need({ bookingId: 'CZ-2026-1002', kind: 'payment_proof' }), need({ bookingId: 'CZ-2026-1003', kind: 'refund_waiting' })]),
  });
  const html = await render({ isAdmin: true, notifications: [], needs: { status: 'ready', data } });
  assert.equal(countOn(html, 'Needs action'), 3, '5 reasons on 3 bookings');
  const onTab = await render({ isAdmin: true, notifications: MIXED, tab: 'needs-action', needs: { status: 'ready', data } });
  assert.doesNotMatch(onTab, /notif-mark-all-btn/, 'no mark as read for live tasks');
  assert.doesNotMatch(onTab, /Message 1/, 'the notifications themselves are not on this tab');
});

test('rows: one per booking with its reasons merged, the main reason as the title and the others as small tags', async () => {
  const data = answer({
    today: grp([need({ bookingId: 'CZ-2026-1001', kind: 'today_pending', urgency: 'today', date: '2026-11-05', waitingMinutes: 90 })]),
    decision: grp([need({ bookingId: 'CZ-2026-1001', kind: 'discount_review', urgency: 'soon' })]),
    money: grp([need({ bookingId: 'CZ-2026-1001', kind: 'payment_proof', urgency: 'soon', link: '/admin/payments?filter=to_verify&q=CZ-2026-1001' })]),
  });
  const html = await render({ isAdmin: true, notifications: [], tab: 'needs-action', needs: { status: 'ready', data } });
  assert.equal((html.match(/class="nr-item"/g) || []).length, 1, 'one row for the booking');
  assert.match(html, /<span class="nr-title">Approve booking<\/span>/);
  assert.match(html, /nr-urgency--today">Today</);
  assert.match(html, /<span class="nr-tag">Discount<\/span><span class="nr-tag">Payment proof<\/span>/);
  assert.match(html, /<a class="nr-row"[^>]* href="\/admin\/services\/requests\/CZ-2026-1001"/, 'the whole row is one link to the booking');
  assert.match(html, /CZ-2026-1001<\/span> · Ana Cruz/);
  assert.match(html, /Booked Nov 5 · Waiting 3 h/, 'the longest wait of its reasons');
  assert.doesNotMatch(html, /Soon</, 'one marker per row: the most urgent');
});

test('rows are most urgent first and a booking that is only waiting has no marker', async () => {
  const data = answer({
    decision: grp([
      need({ bookingId: 'CZ-2026-1005', urgency: 'waiting', date: '2026-11-10' }),
      need({ bookingId: 'CZ-2026-1004', urgency: 'soon', date: '2026-11-12' }),
      need({ bookingId: 'CZ-2026-1006', urgency: 'today', date: '2026-11-05' }),
    ]),
  });
  const html = await render({ isAdmin: true, notifications: [], tab: 'needs-action', needs: { status: 'ready', data } });
  const order = [...html.matchAll(/class="nr-booking">(CZ-2026-\d+)/g)].map((m) => m[1]);
  assert.deepEqual(order, ['CZ-2026-1006', 'CZ-2026-1004', 'CZ-2026-1005']);
  assert.equal((html.match(/nr-urgency /g) || []).length, 2);
});

test('a kind with more than 3 items becomes one summary row with the oldest wait; 3 or fewer stay as rows', async () => {
  const proofs = (n) => Array.from({ length: n }, (_, i) => need({ bookingId: `CZ-2026-20${String(i).padStart(2, '0')}`, kind: 'payment_proof', waitingMinutes: (i + 1) * 1440, link: `/admin/payments?filter=to_verify&q=CZ-2026-20${String(i).padStart(2, '0')}` }));
  const four = await render({ isAdmin: true, notifications: [], tab: 'needs-action', needs: { status: 'ready', data: answer({ money: grp(proofs(15)) }) } });
  assert.match(four, /<span class="nr-title">15 payment proofs to verify, oldest 15 days<\/span>/);
  assert.equal((four.match(/class="nr-item"/g) || []).length, 1, 'the 15 are not listed one by one');
  assert.match(four, /<a class="nr-row nr-row--rollup" href="\/admin\/payments\?filter=to_verify"/);
  assert.equal(countOn(four, 'Needs action'), 15, 'but all 15 bookings are counted');
  const three = await render({ isAdmin: true, notifications: [], tab: 'needs-action', needs: { status: 'ready', data: answer({ money: grp(proofs(3)) }) } });
  assert.equal((three.match(/class="nr-item"/g) || []).length, 3);
  assert.doesNotMatch(three, /oldest/);
});

test('a booking keeps its other reasons when one of its kinds is rolled up, and the summary rows come after the booking rows', async () => {
  const proofs = Array.from({ length: 5 }, (_, i) => need({ bookingId: `CZ-2026-30${i}`, kind: 'payment_proof', waitingMinutes: 600 }));
  const data = answer({
    today: grp([need({ bookingId: 'CZ-2026-300', kind: 'today_pending', urgency: 'today' })]),
    money: grp(proofs),
  });
  const html = await render({ isAdmin: true, notifications: [], tab: 'needs-action', needs: { status: 'ready', data } });
  assert.ok(html.indexOf('Approve booking') < html.indexOf('5 payment proofs to verify, oldest 10 h'));
  assert.equal((html.match(/class="nr-item"/g) || []).length, 2);
  assert.doesNotMatch(html, /nr-tag">Payment proof/, 'the rolled up reason is not repeated as a tag');
  assert.equal(countOn(html, 'Needs action'), 5);
});

test('Needs action states: loading, failed with Retry, and all caught up', async () => {
  const base = { isAdmin: true, notifications: [], tab: 'needs-action' };
  assert.match(await render({ ...base, needs: { status: 'loading', data: null } }), /Loading what needs action/);
  const failed = await render({ ...base, needs: { status: 'error', data: null } });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Could not load what needs action/);
  assert.match(await render({ ...base, needs: { status: 'ready', data: answer({}) } }), /All caught up\. Nothing needs action right now\./);
});

test('the row helpers: titles and tags per kind, with a safe fallback for a kind they do not know', async () => {
  const { buildNeedsActionRows, kindTitle } = await vite.ssrLoadModule('/src/utils/needsAction.js');
  assert.equal(kindTitle('refund_waiting'), 'Process refund');
  assert.equal(kindTitle('something_new'), 'Needs action');
  assert.deepEqual(buildNeedsActionRows(null), { rows: [], bookingCount: 0 });
  const merged = buildNeedsActionRows(answer({ decision: grp([need({ bookingId: 'CZ-2026-9', kind: 'something_new' })]) }));
  assert.equal(merged.rows[0].title, 'Needs action');
});
