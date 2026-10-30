// Run with: npm test (inside server/). E26A, the customer screens on a phone (up to 768 px). The rules are read from the source files (the JSX that
// builds each screen and the CSS that shapes it); nothing here needs a database or the real clock.
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
// the CSS inside the first "@media (max-width: <px>px) {" block that follows `after` in the file
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

// ---- A1: the customer top bar search is a magnifying glass on a phone

test('A1: the customer top bar has a search button that opens a full width field, and Escape and Close shut it', () => {
  const layout = src('pages', 'customer', 'customer_layout.jsx');
  assert.match(layout, /className=\{`topbar-support-btn topbar-search-toggle/);
  assert.match(layout, /aria-label=\{searchValue \? 'Search, a search is active' : 'Search'\}/);
  assert.match(layout, /aria-expanded=\{searchOpen\}/);
  assert.match(layout, /aria-controls="topbar-search-box"/);
  assert.match(layout, /if \(searchOpen\) searchInputRef\.current\?\.focus\(\)/, 'opening focuses the field');
  assert.match(layout, /e\.key === 'Escape' && searchOpen\) closeSearch\(\)/);
  assert.match(layout, /aria-label="Close search"/);
  assert.match(layout, /value=\{searchValue\}/, 'the typed text is the page state, so it stays while the field is open or closed');
  assert.match(layout, /aria-label="Contact Support"/, 'chat is unchanged');
  assert.match(layout, /<NotificationBell onNotificationClick/, 'the bell is unchanged');
});

test('A1: the phone rules are shared with the admin bar, the buttons are 44 px, and wider screens show neither the icon nor Close', () => {
  const css = src('css', 'admin.css');
  assert.match(css, /\.topbar-search-toggle,\s*\.topbar-search-close \{ display: none; \}/);
  const phone = phoneBlock(css, 'ADMIN AND CUSTOMER TOP BAR ON A PHONE');
  assert.match(phone, /:is\(\.admin-dashboard-shell, \.customer-dashboard-shell\) \.topbar-search-toggle,\s*:is\(\.admin-dashboard-shell, \.customer-dashboard-shell\) \.topbar-support-btn \{[^}]*width: 44px; height: 44px/);
  assert.match(phone, /\.topbar-search \{ display: none; \}/);
  assert.match(phone, /\.topbar-search-open \.topbar-search \{[^}]*position: absolute;[^}]*inset: 0/s);
  assert.match(phone, /\.topbar-search-open \.topbar-search input \{[^}]*font-size: 16px/);
  assert.match(css, /\.topbar-search-toggle:focus-visible/);
});

// ---- A2: the Billing pills become a dropdown

test('A2: Billing has a native "Show" select, at least 44 px, for phones, with the same filter state as the pills', () => {
  const page = src('pages', 'customer', 'billings.jsx');
  assert.match(page, /<label htmlFor="billing-filter-select">Show<\/label>/);
  assert.match(page, /<select id="billing-filter-select" value=\{activeFilter\} onChange=\{\(e\) => setActiveFilter\(e\.target\.value\)\}>/);
  assert.match(page, /filters\.map\(\(filter\) => <option key=\{filter\} value=\{filter\}>\{filter\}<\/option>\)/);
  assert.match(page, /onClick=\{\(\) => setActiveFilter\(filter\)\}/, 'the pills still set the same state');
  const css = src('css', 'customer.css');
  assert.match(css, /\.billing-filter-select \{ display: none; \}/, 'hidden above 768 px');
  const phone = phoneBlock(css, 'Billing filter on a phone');
  assert.match(phone, /\.billing-filter-pills \{ display: none !important; \}/);
  assert.match(phone, /\.billing-filter-select select \{[^}]*min-height: 44px[^}]*font-size: 16px/s);
});

test('A2: the dropdown lists every filter the pills have, in the same order', async () => {
  const { BILL_FILTERS } = await vite.ssrLoadModule('/src/utils/customerPayment.js');
  assert.deepEqual([...BILL_FILTERS], ['All', 'Due', 'To Verify', 'Partially Paid', 'Fully Paid', 'Unpaid', 'Refunded']);
});

// ---- A3: the profile page on a phone

test('A3: the profile cards are one column on a phone, inside the page padding, with a 44 px edit button and an accessible name', () => {
  const css = src('css', 'customer.css');
  const phone = phoneBlock(css, 'PROFILE ON A PHONE');
  assert.match(phone, /\.profile-page \.profile-card \{[^}]*box-sizing: border-box[^}]*padding: 16px[^}]*flex-direction: column/s);
  assert.match(phone, /\.profile-page \.profile-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(phone, /\.profile-page \.profile-avatar-lg \{ width: 80px; height: 80px/);
  assert.match(phone, /\.profile-page \.profile-edit-btn \{[^}]*width: 44px; height: 44px/);
  assert.match(phone, /\.profile-page \.profile-contact-line \{[^}]*overflow-wrap: anywhere/);
  const page = src('pages', 'customer', 'profile.jsx');
  assert.match(page, /className="profile-edit-btn" type="button" onClick=\{handleEditClick\} aria-label="Edit profile" title="Edit profile"/);
});

test('A3: in edit mode Cancel and Save sit on one line at the right, 44 px tall, with Save shortened only on the narrowest phones', () => {
  const css = src('css', 'customer.css');
  const phone = phoneBlock(css, 'PROFILE ON A PHONE');
  assert.match(phone, /\.profile-edit-actions \{[^}]*flex-direction: row; flex-wrap: nowrap; justify-content: flex-end/);
  assert.match(phone, /\.profile-edit-actions button \{[^}]*min-height: 44px[^}]*white-space: nowrap/);
  assert.match(phone, /\.profile-field \.bs-input \{[^}]*min-height: 44px; font-size: 16px/);
  assert.match(phone, /\.profile-photo-upload-btn \{[^}]*flex: 1 1 100%[^}]*min-height: 44px/s);
  assert.match(css, /@media \(max-width: 340px\) \{\s*\.profile-save-long \{ display: none; \}/);
  const page = src('pages', 'customer', 'profile.jsx');
  assert.match(page, /onClick=\{handleSaveProfile\} aria-label="Save Changes">\s*Save<span className="profile-save-long"> Changes<\/span>/);
  const buttons = page.slice(page.indexOf('profile-edit-actions'));
  assert.ok(buttons.indexOf('handleCancelEdit') < buttons.indexOf('handleSaveProfile'), 'Cancel is left of Save');
});

test('A3: the desktop layout is untouched, the staff profile keeps its own rules, and the fields carry the right input attributes', () => {
  const css = src('css', 'customer.css');
  const outside = css.replace(phoneBlock(css, 'PROFILE ON A PHONE'), '');
  assert.match(outside, /\.profile-grid \{\s*display: grid;\s*grid-template-columns: repeat\(2, 1fr\)/);
  assert.doesNotMatch(src('css', 'staff.css'), /profile-page/);
  const page = src('pages', 'customer', 'profile.jsx');
  for (const [id, attrs] of [['firstName', 'autoComplete="given-name"'], ['lastName', 'autoComplete="family-name"'], ['email', 'autoComplete="email"\s*inputMode="email"'], ['phone', 'autoComplete="tel"\s*inputMode="tel"'], ['address', 'autoComplete="street-address"']]) {
    assert.match(page, new RegExp(`id="${id}"\s*name="${id}"\s*${attrs}\s*onFocus=\{revealField\}`), id);
  }
  assert.match(page, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/, 'the focused field scrolls into view');
});
