'use strict';
// Run with: npm test (inside server/). E20: the "Needs attention" panel on the admin dashboard and the count on the sidebar. The real components
// are rendered to markup (no browser), in every state, as an admin and as other roles. Nothing here asks a server.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
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

const as = (role) => { global.localStorage = { getItem: (key) => (key === 'user' ? JSON.stringify(role ? { id: 'U1', role } : null) : null), setItem() {}, removeItem() {} }; };
test.afterEach(() => { delete global.localStorage; });

const item = (over) => ({
  id: `k:${over.bookingId}`, kind: 'pending_approval', bookingId: 'CZ-2026-1001', customerName: 'Ana Cruz', label: 'Waiting for approval', date: '2026-11-20',
  waitingSince: '2026-11-03T00:00:00.000Z', waitingMinutes: 180, waitingDays: 0, urgency: 'waiting', link: '/admin/services/requests/CZ-2026-1001', ...over,
});
const group = (key, items, count = items.length, viewAll = '/admin/services/requests?filter=Pending') => ({ key, count, items, viewAll });
const data = (groups) => {
  const full = { today: group('today', [], 0), decision: group('decision', [], 0), money: group('money', [], 0), ...groups };
  return { generatedAt: '2026-11-04T04:00:00.000Z', today: '2026-11-04', total: full.today.count + full.decision.count, groups: full };
};
const render = (element) => renderToStaticMarkup(React.createElement(MemoryRouter, null, element));
const view = async (props) => {
  const { NeedsAttentionView } = await vite.ssrLoadModule('/src/components/needs_attention_panel.jsx');
  return render(React.createElement(NeedsAttentionView, { onRetry() {}, ...props }));
};

test('the panel shows three groups, each with its count in the header, and a heading structure', async () => {
  const html = await view({
    status: 'ready',
    data: data({
      today: group('today', [item({ bookingId: 'CZ-2026-2001', kind: 'today_pending', urgency: 'today', label: 'Waiting for approval, booked today', link: '/admin/services/requests/CZ-2026-2001' })], 1, '/admin/services/requests?when=soon'),
      decision: group('decision', [item({ bookingId: 'CZ-2026-2002' })], 9),
      money: group('money', [item({ bookingId: 'CZ-2026-2003', kind: 'payment_proof', label: 'Down payment proof to verify', link: '/admin/payments?filter=to_verify&q=CZ-2026-2003' })], 2, '/admin/payments?filter=to_verify'),
    }),
  });
  assert.match(html, /<h2[^>]*>Needs attention<\/h2>/);
  for (const [title, count] of [['Today', 1], ['Needs a decision', 9], ['Money', 2]]) {
    assert.match(html, new RegExp(`<h3[^>]*>${title}<span[^>]*aria-label="${count} items"[^>]*>${count}</span></h3>`));
  }
  assert.equal((html.match(/<section class="na-group"/g) || []).length, 3);
  assert.doesNotMatch(html, /All caught up/);
});

test('each row has a label, the booking number, the customer, the booked date, the waiting time, an urgency in words and one button to the right screen', async () => {
  const html = await view({
    status: 'ready',
    data: data({
      decision: group('decision', [item({ bookingId: 'CZ-2026-3001', urgency: 'soon', waitingMinutes: 3 * 1440, link: '/admin/services/requests/CZ-2026-3001' })], 1),
      money: group('money', [item({ bookingId: 'CZ-2026-3002', kind: 'refund_waiting', label: 'Refund waiting to be processed', link: '/admin/payments?filter=refund&q=CZ-2026-3002', urgency: 'today' })], 1, '/admin/payments?filter=to_verify'),
    }),
  });
  assert.match(html, /Waiting for approval/);
  assert.match(html, /CZ-2026-3001/);
  assert.match(html, /Ana Cruz/);
  assert.match(html, /Booked: Nov 20/);
  assert.match(html, /Waiting: 3 days/);
  assert.match(html, /Soon/, 'the urgency is a word, not only a colour');
  assert.match(html, /Due today/);
  assert.match(html, /<a class="na-open"[^>]*href="\/admin\/services\/requests\/CZ-2026-3001"/);
  assert.match(html, /<a class="na-open"[^>]*href="\/admin\/payments\?filter=refund&amp;q=CZ-2026-3002"/);
  assert.match(html, /aria-label="Open Waiting for approval, booking CZ-2026-3001"/);
});

test('View all goes to the matching filtered list, and is not offered for an empty group', async () => {
  const html = await view({
    status: 'ready',
    data: data({
      today: group('today', [item({ bookingId: 'CZ-2026-4001', kind: 'today_pending', urgency: 'today' })], 1, '/admin/services/requests?when=soon'),
      decision: group('decision', [item({ bookingId: 'CZ-2026-4002' })], 7, '/admin/services/requests?filter=Pending'),
    }),
  });
  assert.match(html, /<a class="na-viewall"[^>]*href="\/admin\/services\/requests\?when=soon"/);
  assert.match(html, /<a class="na-viewall"[^>]*href="\/admin\/services\/requests\?filter=Pending"/);
  assert.match(html, /View all \(7\)/, 'the full count when more than the shown 5 exist');
  assert.equal((html.match(/class="na-viewall"/g) || []).length, 2, 'Money is empty, so no link');
  assert.match(html, /Nothing here\./);
});

test('nothing to do shows a calm All caught up message', async () => {
  const html = await view({ status: 'ready', data: data({}) });
  assert.match(html, /All caught up/);
  assert.match(html, /Nothing needs your attention right now\./);
  assert.doesNotMatch(html, /class="na-group"/);
});

test('while loading there is a skeleton and no wrong numbers', async () => {
  const html = await view({ status: 'loading', data: null });
  assert.match(html, /na-skeleton/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /All caught up|na-count/);
});

test('an error with nothing to show has a Try again button', async () => {
  const html = await view({ status: 'error', data: null });
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not load what needs your attention\./);
  assert.match(html, /<button[^>]*class="na-retry"[^>]*>Try again<\/button>/);
  assert.doesNotMatch(html, /All caught up/);
});

test('a refresh that fails while an answer is on screen keeps showing that answer (no flicker, no error box)', async () => {
  const html = await view({ status: 'ready', data: data({ decision: group('decision', [item({ bookingId: 'CZ-2026-5001' })], 1) }) });
  assert.match(html, /CZ-2026-5001/);
  assert.doesNotMatch(html, /Try again/);
});

test('a screen reader is told the counts through a polite live region', async () => {
  const html = await view({ status: 'ready', data: data({ today: group('today', [item({ bookingId: 'CZ-2026-6001', urgency: 'today' })], 3), decision: group('decision', [item({ bookingId: 'CZ-2026-6002' })], 4) }) });
  assert.match(html, /<p class="na-live" role="status" aria-live="polite">Needs attention\. Today: 3, Needs a decision: 4, Money: 0\.<\/p>/);
});

test('the sidebar badge shows Today plus Needs a decision, capped at 99+, and nothing for zero', async () => {
  const { badgeText, formatWaiting } = await vite.ssrLoadModule('/src/utils/needsAttention.js');
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(undefined), '');
  assert.equal(badgeText(1), '1');
  assert.equal(badgeText(99), '99');
  assert.equal(badgeText(100), '99+');
  assert.equal(badgeText(4000), '99+');
  assert.equal(formatWaiting(0), 'Just now');
  assert.equal(formatWaiting(45), '45 min');
  assert.equal(formatWaiting(5 * 60), '5 h');
  assert.equal(formatWaiting(1440), '1 day');
  assert.equal(formatWaiting(3 * 1440 + 10), '3 days');

  as('admin');
  const { resetNeedsAttention } = await vite.ssrLoadModule('/src/hooks/useNeedsAttention.js');
  const Sidebar = (await vite.ssrLoadModule('/src/components/sidebars/admin_sidebar.jsx')).default;
  const sidebar = (total) => {
    resetNeedsAttention({ data: { ...data({}), total } });
    return render(React.createElement(Sidebar, {}));
  };
  assert.match(sidebar(7), /Dashboard<span class="sidebar-badge" aria-label="7 items need attention">7<\/span>/);
  assert.match(sidebar(250), /<span class="sidebar-badge"[^>]*>99\+<\/span>/);
  assert.doesNotMatch(sidebar(0), /sidebar-badge/);
  resetNeedsAttention();
});

test('the panel is for admins only: a technician, a customer or a signed out visitor sees nothing', async () => {
  const { resetNeedsAttention, isAdminUser } = await vite.ssrLoadModule('/src/hooks/useNeedsAttention.js');
  const Panel = (await vite.ssrLoadModule('/src/components/needs_attention_panel.jsx')).default;
  for (const role of ['staff', 'customer', null]) {
    as(role);
    resetNeedsAttention({ data: data({ decision: group('decision', [item({ bookingId: 'CZ-2026-7001' })], 1) }) });
    assert.equal(isAdminUser(), false, String(role));
    assert.equal(render(React.createElement(Panel, {})), '', `${role} sees no panel, even if an answer were in memory`);
  }
  as('admin');
  assert.equal(isAdminUser(), true);
  resetNeedsAttention({ data: data({ decision: group('decision', [item({ bookingId: 'CZ-2026-7001' })], 1) }) });
  assert.match(render(React.createElement(Panel, {})), /CZ-2026-7001/);
  resetNeedsAttention();
});

test('the dashboard puts the panel at the top, and only the admin dashboard has it', async () => {
  const fs = require('node:fs');
  const dashboard = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'dashboard.jsx'), 'utf8');
  assert.ok(dashboard.indexOf('<NeedsAttentionPanel />') > 0 && dashboard.indexOf('<NeedsAttentionPanel />') < dashboard.indexOf('className="stats-container"'), 'above the statistics');
  for (const other of ['staff/dashboard.jsx', 'customer/dashboard.jsx']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'src', 'pages', other), 'utf8'), /NeedsAttention/, other);
  }
});

test('the list screens the panel links to read the filter from the address', async () => {
  const fs = require('node:fs');
  const read = (f) => fs.readFileSync(path.join(root, 'src', 'pages', 'admin', f), 'utf8');
  assert.match(read('service_requests.jsx'), /linkParams\.get\('filter'\)[\s\S]*linkParams\.get\('when'\) === 'soon'/);
  assert.match(read('payments.jsx'), /linkParams\.get\('filter'\)[\s\S]*searchLink\.get\('q'\)/);
  assert.match(read('back_jobs.jsx'), /linkParams\.get\('filter'\)/);
});
