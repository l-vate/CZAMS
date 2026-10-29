// Run with: npm test (inside server/). E23: the admin Bookings page on a phone: the search folds into an icon, the two views are a two tab switch,
// the status filter is one scrollable row of chips, the cards label their dates, summarise the technicians and are one link to the details.
// No database; the client files are loaded through Vite and rendered to markup.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
const read = (file) => fs.readFileSync(path.join(root, 'src', file), 'utf8');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const render = async (file, props) => {
  const React = fromRoot('react');
  const { MemoryRouter } = fromRoot('react-router-dom');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const Component = (await vite.ssrLoadModule(file)).default;
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props)));
};

test('the top bar has a search icon button that controls the search box, closed by default, and a close button', async () => {
  const html = await render('/src/pages/admin/admin_layout.jsx', { title: 'Bookings', searchValue: '', onSearchChange: () => {}, searchPlaceholder: 'Search by booking ID...' });
  assert.match(html, /<button[^>]*class="[^"]*topbar-search-toggle[^"]*"[^>]*aria-label="Search"[^>]*aria-expanded="false"[^>]*aria-controls="topbar-search-box"/);
  assert.match(html, /id="topbar-search-box"[^>]*role="search"/);
  assert.match(html, /aria-label="Close search"/);
  assert.match(html, /<input[^>]*type="search"[^>]*aria-label="Search by booking ID"/);
  assert.equal(/topbar-search-open/.test(html), false);
  assert.match(html, /dashboard-topbar-title">Bookings</);
});

test('a page without search gets no search icon, and the bell and chat stay in the bar', async () => {
  const html = await render('/src/pages/admin/admin_layout.jsx', { title: 'Calendar' });
  assert.equal(/topbar-search-toggle/.test(html), false);
  assert.match(html, /topbar-support-btn/);
  assert.match(html, /notif-bell/);
});

test('the layout opens the search on tap, focuses the input, and closes on Escape or the close button', () => {
  const src = read('pages/admin/admin_layout.jsx');
  assert.match(src, /onClick=\{\(\) => setSearchOpen\(true\)\}/);
  assert.match(src, /if \(searchOpen\) searchInputRef\.current\?\.focus\(\)/);
  assert.match(src, /e\.key === 'Escape' && searchOpen/);
  assert.match(src, /onClick=\{closeSearch\}/);
  assert.match(src, /searchToggleRef\.current\?\.focus\(\)/, 'focus goes back to the icon');
  const css = read('css/admin.css');
  assert.match(css, /\.topbar-search-open \.topbar-search \{[^}]*position: absolute;[^}]*inset: 0/);
  assert.match(css, /\.topbar-search-toggle,\s*\.topbar-search-close \{ display: none; \}/, 'wider screens keep the search box');
});

test('the Bookings page has a two tab switch and one row of status chips with counts, All once', async () => {
  const html = await render('/src/pages/admin/service_requests.jsx', {});
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, /role="tablist"[^>]*aria-label="Bookings view"/);
  assert.match(html, /aria-selected="true"[^>]*>All Bookings</);
  assert.match(html, /aria-selected="false"[^>]*>Pending Queue</);
  assert.equal((html.match(/class="req-chip[ "]/g) || []).length, 6, 'All plus the five statuses');
  assert.equal((html.match(/>All </g) || []).length, 1, 'All appears once as a chip');
  assert.equal((html.match(/req-chip--active/g) || []).length, 1, 'only the selected chip is filled');
  ['Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'].forEach((s) => assert.ok(html.includes(`>${s} <`), s));
  assert.equal(/filter-pill/.test(html), false, 'the old two groups of pills are gone');
  assert.match(html, /req-chip-count/);
});

test('the chips are one row that scrolls sideways, at least 44 px tall, navy only when selected; New Booking is navy', () => {
  const css = read('css/admin.css');
  assert.match(css, /\.req-chips \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto/);
  assert.match(css, /\.req-chip \{[^}]*min-height: 44px/);
  assert.match(css, /\.req-chip--active \{ background: var\(--navy\)/);
  assert.match(css, /\.req-page-head \.req-new-btn \{[^}]*background: var\(--navy\)/);
  const src = read('pages/admin/service_requests.jsx');
  assert.equal(/getFilterPillStyle/.test(src), false, 'no per status colors on the chips');
  assert.match(src, /linkParams\.get\('filter'\)/, 'the URL filter still works');
});

test('card dates are labeled in one format, the booked date first', async () => {
  const { bookedForText, createdText } = await vite.ssrLoadModule('/src/utils/bookingCardText.js');
  assert.equal(bookedForText('2026-11-03'), 'Booked for Nov 3, 2026');
  assert.equal(bookedForText(''), 'Booked date not set');
  const now = new Date('2026-10-29T04:00:00Z');
  assert.equal(createdText('2026-10-28T02:00:00Z', now), 'Created Oct 28');
  assert.equal(createdText('2025-12-30T10:00:00Z', now), 'Created Dec 30, 2025');
  assert.equal(createdText('2026-10-27T17:00:00Z', now), 'Created Oct 28', 'read as a Manila day');
  assert.equal(createdText(null, now), 'Created date unknown');
});

test('technicians show as a count with the names in muted text, and a status count per chip', async () => {
  const { techniciansSummary, statusCounts } = await vite.ssrLoadModule('/src/utils/bookingCardText.js');
  assert.deepEqual(techniciansSummary([{ name: 'Ana' }, { name: 'Ben' }]), { count: '2 technicians', names: 'Ana, Ben', needsNew: false });
  assert.equal(techniciansSummary([{ name: 'Ana' }]).count, '1 technician');
  assert.equal(techniciansSummary([]).count, 'No technician assigned');
  assert.equal(techniciansSummary([], true).needsNew, true);
  assert.deepEqual(statusCounts([{ status: 'Pending' }, { status: 'Pending' }, { status: 'Approved' }], ['Pending', 'Approved', 'Completed']), { All: 3, Pending: 2, Approved: 1, Completed: 0 });
  assert.match(read('css/admin.css'), /\.req-tech-names \{[^}]*text-overflow: ellipsis/);
});

test('the whole card is one link to the details, with one small View details text link and the status badge kept', () => {
  const src = read('pages/admin/service_requests.jsx');
  assert.match(src, /<Link\s+className="req-card-link"\s+to=\{`\/admin\/services\/requests\/\$\{encodeURIComponent\(req\.bookingId\)\}`\}/);
  assert.equal((src.match(/req-card-link/g) || []).length, 1, 'one link per card');
  assert.equal(/view-details-btn/.test(src), false, 'no outlined button on the cards');
  assert.match(src, /req-status-badge/);
  const css = read('css/admin.css');
  assert.match(css, /\.req-card \{\s*position: relative;/);
  assert.match(css, /\.req-card-link::after \{ content: ''; position: absolute; inset: 0;/);
});
