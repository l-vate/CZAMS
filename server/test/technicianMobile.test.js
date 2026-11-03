// Run with: npm test (inside server/). The technician screens on a phone (up to 768 px). The rules are read from the source files (the JSX that
// builds each screen and the CSS that shapes it); nothing here needs a database or the real clock.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let closeVite;
let renderToStaticMarkup;
before(async () => {
  ({ vite, close: closeVite } = await startSsrServer());
  renderToStaticMarkup = createRequire(path.join(__dirname, '..', '..', 'package.json'))('react-dom/server').renderToStaticMarkup;
});
after(async () => { await closeVite(); });

const src = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...parts), 'utf8');
// the CSS inside the "@media (max-width: <px>px) {" block that follows `after` in the file
const phoneBlock = (css, after, px = 768) => {
  const from = css.indexOf(after);
  assert.ok(from >= 0, `${after} is in the file`);
  const open = css.indexOf(`@media (max-width: ${px}px) {`, from);
  assert.ok(open >= 0, `a ${px}px block follows`);
  let depth = 0;
  for (let i = css.indexOf('{', open); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(open, i + 1); }
  }
  return css.slice(open);
};
// every rule outside a media block
const outsideMedia = (withComments) => {
  const css = withComments.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let depth = 0;
  let inMedia = false;
  for (let i = 0; i < css.length; i += 1) {
    if (!inMedia && css.startsWith('@media', i)) { inMedia = true; depth = 0; }
    if (!inMedia) out += css[i];
    else if (css[i] === '{') depth += 1;
    else if (css[i] === '}') { depth -= 1; if (depth === 0) inMedia = false; }
  }
  return out;
};

// ---- Part 1: the staff Profile

test('Profile: the card keeps room for a 44 px pencil, the text wraps, and nothing is scoped outside the staff shell', () => {
  const css = src('css', 'staff.css');
  const phone = phoneBlock(css, 'TECHNICIAN SCREENS ON A PHONE');
  assert.match(phone, /\.staff-dashboard-shell \.profile-card \{[^}]*padding-right: 68px/s);
  assert.match(phone, /\.staff-dashboard-shell \.profile-avatar-lg \{ width: 80px; height: 80px/);
  assert.match(phone, /\.staff-dashboard-shell \.profile-name \{[^}]*overflow-wrap: anywhere/);
  assert.match(phone, /\.staff-dashboard-shell \.profile-contact-line \{[^}]*overflow-wrap: anywhere/);
  assert.match(phone, /\.staff-dashboard-shell \.profile-edit-btn \{[^}]*width: 44px; height: 44px/);
  const lines = phone.split('\n').filter((l) => /\{/.test(l) && !/@media/.test(l) && !/^\s*\/\*/.test(l));
  assert.ok(lines.length > 0);
  lines.forEach((l) => assert.match(l.trim(), /^(\.staff-dashboard-shell|\.staff-calendar-x1|\.cal-shell--phone)/, `scoped: ${l.trim().slice(0, 60)}`));
});

test('Profile: edit mode is one column with Cancel and Save right aligned at equal width, Change Password is a right aligned navy button', () => {
  const phone = phoneBlock(src('css', 'staff.css'), 'TECHNICIAN SCREENS ON A PHONE');
  assert.match(phone, /\.profile-card:has\(\.tech-profile-edit-form\) \{ flex-direction: column/);
  assert.match(phone, /\.tech-profile-edit-form \{ max-width: none; width: 100%/);
  assert.match(phone, /\.tech-profile-edit-form \.bs-input \{[^}]*min-height: 44px; font-size: 16px/);
  assert.match(phone, /\.cancel-confirm-actions \{ flex-direction: row; justify-content: flex-end/);
  assert.match(phone, /\.cancel-confirm-actions button \{ flex: 0 0 140px; min-height: 44px/);
  assert.match(phone, /\.account-actions \{ margin: 0; justify-content: flex-end/);
  assert.match(phone, /\.change-password-btn \{ min-height: 44px; min-width: 170px/);
  assert.match(src('css', 'staff.css'), /@media \(max-width: 340px\) \{\s*\.staff-dashboard-shell \.change-password-btn \{ width: 100%/);
});

test('Profile: the base desktop rules are unchanged and the page markup is unchanged', () => {
  const base = outsideMedia(src('css', 'staff.css'));
  assert.match(base, /\.profile-card \{[^}]*padding: 32px;/s);
  assert.match(base, /\.profile-avatar-lg \{[^}]*width: 110px;[^}]*height: 110px;/s);
  assert.match(base, /\.profile-edit-btn \{[^}]*width: 36px;[^}]*height: 36px;/s);
  assert.match(base, /\.tech-profile-edit-form \{[^}]*max-width: 340px;/s);
  assert.doesNotMatch(base, /68px/);
  const page = src('pages', 'staff', 'profile.jsx');
  assert.match(page, /className="profile-card"/);
  assert.match(page, /<ChangePasswordModal onClose=/);
});

// ---- Part 2: the staff Calendar

test('Calendar: only the staff page asks for the phone layout, so the admin calendar and desktop keep what they had', () => {
  assert.match(src('pages', 'staff', 'calendar.jsx'), /<CalendarView jobs=\{jobs\} title="My Schedule" phoneLayout \/>/);
  assert.match(src('pages', 'admin', 'calendar.jsx'), /<CalendarView jobs=\{jobs\} title="Schedule" \/>/);
  const view = src('components', 'calendar_view.jsx');
  assert.match(view, /const phone = phoneLayout && isPhone;/);
  assert.match(view, /useState\(\(\) => \(phoneLayout && isPhone \? "Month" : "Week"\)\)/, 'Month is the default on a phone, Week elsewhere');
  assert.match(view, /<div className=\{`cal-shell\$\{phone \? " cal-shell--phone" : ""\}`\}>/);
});

test('Calendar: phone rules are in a 768 px block and scoped to .cal-shell--phone', () => {
  const css = src('css', 'components', 'calendar.css');
  const phone = phoneBlock(css, 'STAFF CALENDAR ON A PHONE');
  assert.match(phone, /\.cal-shell--phone \.cal-toolbar \{ flex-direction: column/);
  assert.match(phone, /\.cal-shell--phone \.cal-header-label \{[^}]*white-space: nowrap/);
  assert.match(phone, /\.cal-shell--phone \.cal-icon-btn \{ width: 44px; height: 44px/);
  assert.match(phone, /\.cal-shell--phone \.cal-view-toggle \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); width: 100%/);
  assert.match(phone, /\.cal-shell--phone \.cal-view-btn \{ min-height: 44px/);
  assert.match(phone, /\.cal-phone-month \{ display: grid; grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)|\.cal-phone-month \{ gap: 2px; \}/);
  assert.match(phone, /\.cal-phone-cell \{[^}]*min-width: 0; min-height: 52px/s);
  assert.match(phone, /\.cal-phone-job \{[^}]*min-height: 56px/s);
  assert.match(phone, /\.cal-phone-job\.cal-job-cancelled \{ opacity: 0\.75; \}/);
  assert.match(phone, /\.cal-sheet-overlay \{ align-items: flex-end/);
  assert.match(phone, /\.cal-sheet \.cal-sheet-close \{ width: 44px; height: 44px; \}/);
  // nothing for the phone layout leaks outside the media block
  assert.doesNotMatch(outsideMedia(css), /cal-phone|cal-sheet|cal-shell--phone/);
  // the desktop month grid, chips and side panel are as before
  const base = outsideMedia(css);
  assert.match(base, /\.cal-month-day-cell \{\s*min-height: 96px;/);
  assert.match(base, /\.cal-detail-panel \{\s*width: 280px;/);
  assert.match(base, /\.cal-month-job-chip \{[^}]*white-space: normal/s);
});

test('Calendar: the details open in the shared modal with a labelled close button, Escape and a dialog role; desktop keeps the side panel', () => {
  const view = src('components', 'calendar_view.jsx');
  assert.match(view, /className="modal-overlay cal-sheet-overlay"/);
  assert.match(view, /role="dialog"\s+aria-modal="true"\s+aria-labelledby="cal-sheet-title"/);
  assert.match(view, /aria-label="Close"/);
  assert.match(view, /e\.key === "Escape"/);
  assert.match(view, /phone\s*\? <JobDetailSheet job=\{selectedJob\} onClose=\{\(\) => setSelectedJob\(null\)\} \/>\s*: <JobDetailPanel/);
});

test('Calendar: which jobs show on a day is unchanged, cancelled ones included, in the phone lists and in the desktop grids', async () => {
  const { default: CalendarView } = await vite.ssrLoadModule('/src/components/calendar_view.jsx');
  const { createElement } = createRequire(path.join(__dirname, '..', '..', 'package.json'))('react');
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const key = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const job = (id, startHour, status, title) => ({ id, title, customer: `Cust ${id}`, assignedTo: 'Me', date: key, startHour, endHour: startHour + 4, status });
  const jobs = [
    job('a', 8, 'confirmed', 'Job A'), job('b', 13, 'in-progress', 'Job B'),
    job('c', 8, 'cancelled', 'Job C'), { ...job('d', 8, 'pending', 'Job D'), date: '2001-01-01' },
  ];
  for (const props of [{ jobs }, { jobs, phoneLayout: true }]) {
    const html = renderToStaticMarkup(createElement(CalendarView, props));
    ['Job A', 'Job B', 'Job C'].forEach((t) => assert.ok(html.includes(t), `${t} is on today's week (props ${Object.keys(props)})`));
    assert.ok(!html.includes('Job D'), 'a job on another day is not shown');
    assert.ok(html.includes('cal-job-cancelled'), 'the cancelled booking keeps showing, with its status style');
  }
});

test('Calendar: status and time block mapping used by the staff page is unchanged', async () => {
  const { mapBookingStatusToCalendarStatus, getTimeBlockHours } = await vite.ssrLoadModule('/src/utils/calendar.js');
  assert.equal(mapBookingStatusToCalendarStatus('Approved'), 'confirmed');
  assert.equal(mapBookingStatusToCalendarStatus('In Progress'), 'in-progress');
  assert.equal(mapBookingStatusToCalendarStatus('Cancelled'), 'cancelled');
  assert.equal(mapBookingStatusToCalendarStatus(undefined), 'pending');
  assert.ok(getTimeBlockHours('Morning').startHour < getTimeBlockHours('Afternoon').startHour);
  const page = src('pages', 'staff', 'calendar.jsx');
  assert.match(page, /listTechnicianJobs\(\)/, 'the same jobs endpoint, so a technician sees the same jobs');
  assert.match(page, /data\.flatMap\(toCalendarJob\)/);
});

// ---- Part 3: the other staff screens

test('Staff screens: 44 px controls, modals and the menu are phone rules scoped to the staff shell', () => {
  const css = src('css', 'staff.css');
  const phone = phoneBlock(css, 'TECHNICIAN SCREENS ON A PHONE');
  assert.match(phone, /\.staff-dashboard-shell \.sidebar-toggle-btn,\s*\.staff-dashboard-shell \.notif-bell-btn \{ min-width: 44px; min-height: 44px; \}/);
  assert.match(phone, /\.staff-dashboard-shell \.sidebar \.sidebar-link \{ min-height: 44px/);
  assert.match(phone, /\.staff-dashboard-shell \.filter-pill \{ min-height: 44px; \}/);
  assert.match(phone, /\.tech-sort-btn, \.tech-search-input, \.view-details-btn, \.tech-job-action-btn, \.tech-job-primary-btn[^)]*\) \{ min-height: 44px/);
  assert.match(phone, /\.staff-dashboard-shell \.modal-overlay \.modal-close-btn \{ width: 44px; height: 44px; \}/);
  assert.match(phone, /\.chat-send-btn \{ min-width: 44px; min-height: 44px; \}/);
  assert.doesNotMatch(outsideMedia(css), /TECHNICIAN SCREENS ON A PHONE[\s\S]*min-height: 44px/);
});

test('Staff menu: Log Out stays pinned at the bottom of the phone menu, as on the customer side', () => {
  const sidebar = src('components', 'sidebars', 'staff_sidebar.jsx');
  assert.match(sidebar, /<div className="sidebar-logout">/);
  const css = src('css', 'components', 'sidebar.css');
  const phone = phoneBlock(css, 'Log Out is pinned', 900);
  assert.match(phone, /\.dashboard-shell \.sidebar \{[^}]*height: 100dvh;[^}]*overflow: hidden/s);
  assert.match(phone, /\.sidebar-logout \{[^}]*flex: none/s);
});
