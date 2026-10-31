// Run with: npm test (inside server/). E27: the admin dashboard filter row has three pills (All Clients, Residential, Commercial). "Deleted accounts"
// is for records only (Reports and Analytics keep their own filter, the booking list keeps the "Deleted customer" label), so it is not on the dashboard.
// Read from the source files and the pure client group rule; no database, no real clock.
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

const src = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...parts), 'utf8');
const phoneBlock = (css, after) => {
  const from = css.indexOf(after);
  assert.ok(from >= 0, `${after} is in the file`);
  const open = css.indexOf('@media (max-width: 768px) {', from);
  let depth = 0;
  for (let i = css.indexOf('{', open); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(open, i + 1); }
  }
  return css.slice(open);
};

test('the dashboard pill row has three pills and no deleted accounts pill', () => {
  const dash = src('pages', 'admin', 'dashboard.jsx');
  const list = dash.slice(dash.indexOf('const CLIENT_TYPE_FILTERS = ['), dash.indexOf('];', dash.indexOf('const CLIENT_TYPE_FILTERS = [')));
  const labels = [...list.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['All Clients', 'Residential', 'Commercial']);
  assert.doesNotMatch(dash, /Deleted accounts/);
  assert.match(dash, /if \(activeClientType === 'all'\) return bookings;/, 'All Clients is every booking, unfiltered');
});

test('All Clients still counts the bookings of a deleted account; Residential and Commercial do not', async () => {
  const { clientGroupOf } = await vite.ssrLoadModule('/src/utils/clientGroup.js');
  const bookings = [
    { bookingId: 'CZ-1', customer: { clientType: 'Residential' } },
    { bookingId: 'CZ-2', customer: { clientType: 'Commercial' } },
    { bookingId: 'CZ-3', customer: null },
  ];
  const view = (filter) => (filter === 'all' ? bookings : bookings.filter((b) => clientGroupOf(b.customer) === filter));
  assert.equal(view('all').length, 3, 'the deleted account booking is in the total');
  assert.equal(view('Residential').length, 1);
  assert.equal(view('Commercial').length, 1);
  assert.equal(clientGroupOf(null), 'Unknown', 'the group still exists for the records screens');
});

test('the records screens keep their deleted accounts filter and the Deleted customer label', () => {
  assert.match(src('pages', 'admin', 'reports.jsx'), /label: 'Deleted accounts'/);
  assert.match(src('pages', 'admin', 'analytics.jsx'), /label: 'Deleted accounts'/);
  assert.match(src('utils', 'customerLabel.js'), /DELETED_CUSTOMER = 'Deleted customer'/);
});

test('selected pills are white on navy even under the pointer, unselected are navy on white, and focus shows a ring', () => {
  const css = src('css', 'admin.css');
  assert.match(css, /\.filter-pill \{[^}]*background: var\(--white\);\s*color: var\(--navy\);/s);
  assert.match(css, /\.filter-pill:hover \{\s*border-color: var\(--navy\);\s*color: var\(--navy\);/);
  assert.match(css, /\.filter-pill--active,\s*\.filter-pill--active:hover,\s*\.filter-pill--active:focus-visible \{\s*background: var\(--navy\);\s*border-color: var\(--navy\);\s*color: var\(--white\);/);
  assert.match(css, /\.filter-pill:focus-visible \{\s*outline: 3px solid var\(--action-focus\);/);
  assert.doesNotMatch(css.slice(css.indexOf('.filter-pill:hover'), css.indexOf('.payments-search')), /color: var\(--primary\)/, 'no blue text on the pill states');
});

test('(optional) on a phone the stat cards are two per row, one per row at 340 px and below; wide screens are unchanged', () => {
  const css = src('css', 'admin.css');
  const phone = phoneBlock(css, 'ADMIN DASHBOARD STAT CARDS ON A PHONE');
  assert.match(phone, /\.stats-container \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 12px; \}/);
  assert.match(phone, /\.stat-icon \{ width: 34px; height: 34px;/);
  assert.match(css, /@media \(max-width: 340px\) \{\s*\.stats-container \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.stats-container \{\s*display: grid;\s*grid-template-columns: repeat\(auto-fit, minmax\(220px, 1fr\)\);/, 'the wide layout is as before');
});
