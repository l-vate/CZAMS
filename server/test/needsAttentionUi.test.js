'use strict';
// Run with: npm test (inside server/). E20: the count on the admin bell and the screens the Needs action rows link to. Components are rendered
// to markup (no browser) and nothing here asks a server. The Needs action tab itself is tested in notificationsCenter.test.js.
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

const render = (element) => renderToStaticMarkup(React.createElement(MemoryRouter, null, element));

test('how long something has waited reads as Just now, minutes, hours or days', async () => {
  const { formatWaiting } = await vite.ssrLoadModule('/src/utils/needsAttention.js');
  assert.equal(formatWaiting(0), 'Just now');
  assert.equal(formatWaiting(45), '45 min');
  assert.equal(formatWaiting(5 * 60), '5 h');
  assert.equal(formatWaiting(1440), '1 day');
  assert.equal(formatWaiting(3 * 1440 + 10), '3 days');
});

test('the admin bell carries the number of bookings that need action (added to its unread count), and the Dashboard link carries none', async () => {
  const Bell = (await vite.ssrLoadModule('/src/components/notification_bell.jsx')).default;
  const bell = (props) => render(React.createElement(Bell, { viewAllRoute: '/admin/notifications', ...props }));
  const route = '/admin/notifications?tab=needs-action';
  assert.match(bell({ actionCount: 7, actionRoute: route }), /aria-label="Notifications, 7 new"[^>]*>.*<span class="notif-bell-badge">7<\/span>/);
  assert.match(bell({ actionCount: 25, actionRoute: route }), /notif-bell-badge">9\+</);
  assert.doesNotMatch(bell({ actionCount: 0, actionRoute: route }), /notif-bell-badge/);
  assert.doesNotMatch(bell({ actionCount: 7 }), /notif-bell-badge/, 'a customer or technician bell has no action route, so no count');

  const fsx = require('node:fs');
  const read = (...f) => fsx.readFileSync(path.join(root, 'src', ...f), 'utf8');
  assert.doesNotMatch(read('components', 'sidebars', 'admin_sidebar.jsx'), /sidebar-badge|badgeText/);
  assert.match(read('pages', 'admin', 'admin_layout.jsx'), /actionCount=\{needsActionCount\(needs\.data\)\}/);
  for (const other of ['customer/customer_layout.jsx', 'staff/staff_layout.jsx']) assert.doesNotMatch(read('pages', other), /actionCount|actionRoute/, other);
});

test('the dashboard no longer has the panel (it lives on the Needs action tab of Notifications)', async () => {
  const fsx = require('node:fs');
  const read = (...f) => fsx.readFileSync(path.join(root, 'src', ...f), 'utf8');
  assert.doesNotMatch(read('pages', 'admin', 'dashboard.jsx'), /NeedsAttention/);
  assert.equal(fsx.existsSync(path.join(root, 'src', 'components', 'needs_attention_panel.jsx')), false);
  for (const other of ['staff/dashboard.jsx', 'customer/dashboard.jsx']) assert.doesNotMatch(read('pages', other), /NeedsAttention/, other);
});

test('the list screens the panel links to read the filter from the address', async () => {
  const fs = require('node:fs');
  const read = (f) => fs.readFileSync(path.join(root, 'src', 'pages', 'admin', f), 'utf8');
  assert.match(read('service_requests.jsx'), /linkParams\.get\('filter'\)[\s\S]*linkParams\.get\('when'\) === 'soon'/);
  assert.match(read('payments.jsx'), /linkParams\.get\('filter'\)[\s\S]*searchLink\.get\('q'\)/);
  assert.match(read('back_jobs.jsx'), /linkParams\.get\('filter'\)/);
});

test('the booking details offer a Verify payment button that opens Payments on this booking, when a payment waits or the approval was refused for it', async () => {
  const fsx = require('node:fs');
  const src = fsx.readFileSync(path.join(root, 'src', 'components', 'admin_service_details_modal.jsx'), 'utf8');
  assert.match(src, /\/down payment\/i\.test\(error\) \|\| booking\.paymentStatus === 'to_verify' \|\| booking\.balancePaymentStatus === 'to_verify'/);
  assert.match(src, /to=\{`\/admin\/payments\?filter=to_verify&q=\$\{encodeURIComponent\(booking\.bookingId\)\}`\}/);
  assert.match(fsx.readFileSync(path.join(root, 'src', 'pages', 'admin', 'payments.jsx'), 'utf8'), /searchLink\.get\('q'\)/, 'Payments reads the booking from the address');
});
