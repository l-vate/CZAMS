// Run with: npm test (inside server/). A technician is told about a new notification (a new job, a changed or cancelled job) while the app is
// open: once, never for what was already there when the page opened, and never again on the next refresh. No database; client files load through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');

const note = (id, over = {}) => ({ _id: String(id), read: false, createdAt: `2026-11-0${id}T08:00:00Z`, message: `m${id}`, type: 'booking_assigned', ...over });

// what the hook does on each refresh: the first load is remembered, later loads announce what was not seen
function session(newNotifications) {
  let seen = null;
  return (list) => {
    if (seen === null) { seen = new Set(list.map((n) => n._id)); return []; }
    const fresh = newNotifications(list, seen);
    list.forEach((n) => seen.add(n._id));
    return fresh.map((n) => n._id);
  };
}

test('old notifications are not announced when the page opens, a new one is announced once', async () => {
  const { newNotifications } = await vite.ssrLoadModule('/src/hooks/useNotificationToasts.js');
  const refresh = session(newNotifications);
  assert.deepEqual(refresh([note(1), note(2)]), []); // first load: old news
  assert.deepEqual(refresh([note(1), note(2)]), []); // nothing new
  assert.deepEqual(refresh([note(3), note(1), note(2)]), ['3']); // a new job arrives
  assert.deepEqual(refresh([note(3), note(1), note(2)]), []); // the same one is not repeated on the next refresh
  assert.deepEqual(refresh([note(4), note(3), note(1), note(2)]), ['4']); // a changed or cancelled job
});

test('a notification that is already read, or arrives read, is never announced', async () => {
  const { newNotifications } = await vite.ssrLoadModule('/src/hooks/useNotificationToasts.js');
  const refresh = session(newNotifications);
  refresh([note(1)]);
  assert.deepEqual(refresh([note(2, { read: true }), note(1)]), []);
});

test('several new ones are announced oldest first, and the newest is the one shown', async () => {
  const { newNotifications } = await vite.ssrLoadModule('/src/hooks/useNotificationToasts.js');
  assert.deepEqual(newNotifications([note(3), note(2), note(1)], new Set()).map((n) => n._id), ['1', '2', '3']);
  assert.deepEqual(newNotifications(null, new Set()), []);
});

test('the technician layout shows the message with an Open button, on the existing refresh interval, with no sound', () => {
  const layout = read('pages/staff/staff_layout.jsx');
  assert.match(layout, /useNotificationToasts\(\)/);
  assert.match(layout, /label: 'Open'/);
  assert.match(layout, /technicianNotificationTarget|handleNotificationClick\(toast\)/);
  const hook = read('hooks/useNotificationToasts.js');
  assert.match(hook, /useRefreshOnFocus\(check\)/);
  assert.doesNotMatch(hook + read('components/notice.jsx'), /new Audio|\.play\(\)|AudioContext/);
});

test('the admin and the customer layouts do not get the message', () => {
  assert.doesNotMatch(read('pages/admin/admin_layout.jsx'), /useNotificationToasts/);
  assert.doesNotMatch(read('pages/customer/customer_layout.jsx'), /useNotificationToasts/);
});
