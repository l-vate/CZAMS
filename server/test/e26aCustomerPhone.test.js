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
  assert.match(layout, /e\.key === 'Escape' && searchOpen\) \{ e\.preventDefault\(\); closeSearch\(\); \}/, 'Escape closes without the browser clearing the typed text');
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
  assert.match(src('css', 'staff.css'), /\.profile-card \{[^}]*padding: 32px/, 'the shared base card rule is unchanged');
  const page = src('pages', 'customer', 'profile.jsx');
  for (const [id, attrs] of [['firstName', 'autoComplete="given-name"'], ['lastName', 'autoComplete="family-name"'], ['email', 'autoComplete="email"\\s*inputMode="email"'], ['phone', 'autoComplete="tel"\\s*inputMode="tel"'], ['address', 'autoComplete="street-address"']]) {
    assert.match(page, new RegExp(`id="${id}"\\s*name="${id}"\\s*${attrs}\\s*onFocus=\\{revealField\\}`), id);
  }
  assert.match(page, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/, 'the focused field scrolls into view');
});

// ---- A4: billing cards

test('A4: the badge key gives each payment state its own class, and none of them is the primary button blue', async () => {
  const { billBadgeKey } = await vite.ssrLoadModule('/src/utils/billingCard.js');
  const bill = (raw, flags = {}) => ({ raw, ...flags });
  assert.equal(billBadgeKey(bill({})), 'unpaid');
  assert.equal(billBadgeKey(bill({ paymentStatus: 'to_verify' })), 'verify');
  assert.equal(billBadgeKey(bill({ paymentStatus: 'partially_paid' })), 'partial');
  assert.equal(billBadgeKey(bill({ paymentStatus: 'fully_paid' })), 'paid');
  assert.equal(billBadgeKey(bill({ paymentStatus: 'rejected' })), 'rejected');
  assert.equal(billBadgeKey(bill({}, { isRefunded: true })), 'refunded');
  assert.equal(billBadgeKey(bill({}, { isCancelled: true })), 'cancelled');
  assert.equal(billBadgeKey(bill({}, { isBackJob: true })), 'backjob');
  const css = src('css', 'customer.css');
  const colors = ['unpaid', 'verify', 'partial', 'paid', 'rejected', 'refunded', 'cancelled'].map((k) => new RegExp(`\.billing-badge--${k} \{ background: (#[0-9a-f]{6}); color: (#[0-9a-f]{6});`).exec(css));
  assert.ok(colors.every(Boolean), 'every state has a badge rule');
  assert.equal(new Set(colors.map((m) => m[1])).size >= 6, true, 'the states do not share one colour');
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255); };
  for (const m of colors) {
    const [hi, lo] = [lum(m[1]), lum(m[2])].sort((a, b) => b - a);
    assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5, `${m[0]} meets AA`);
  }
});

test('A4: the dates are one booked date and a smaller created date, read as written', async () => {
  const { formatBookedDate, formatCreatedDate, peso2 } = await vite.ssrLoadModule('/src/utils/billingCard.js');
  assert.equal(formatBookedDate('2026-10-25'), 'Oct 25, 2026');
  assert.equal(formatBookedDate('2026-01-05'), 'Jan 5, 2026');
  assert.equal(formatCreatedDate(new Date(2026, 9, 22, 12)), 'Oct 22');
  assert.equal(peso2(3500), '₱3,500.00');
  const page = src('pages', 'customer', 'billings.jsx');
  assert.match(page, /Booked for \{formatBookedDate\(bill\.raw\.date\)\}/);
  assert.match(page, /Created \{formatCreatedDate\(bill\.createdAt\)\}/);
  assert.equal((page.match(/\{bill\.date\}/g) || []).length, 0, 'the created date is no longer printed twice');
});

test('A4: Due now shows only when something is due, with the existing amounts; every card has the same actions; the card opens the details', () => {
  const page = src('pages', 'customer', 'billings.jsx');
  assert.match(page, /const dueNow = Boolean\(bill\.due\.kind\) && !bill\.isCancelled && !bill\.isBackJob && !waitingForConfirmation && !proofWaiting;/);
  assert.match(page, /const dueAmount = bill\.due\.kind === 'balance' \? bill\.remaining : bill\.toPayNow;/, 'no new money calculation');
  assert.match(page, /\{dueNow && \(\s*<span className="billing-card-due">/);
  assert.match(page, /bill\.due\.kind === 'balance' \? 'Balance' : 'Down payment'/);
  assert.match(page, /Total <strong>\{peso2\(bill\.basePrice \|\| 0\)\}<\/strong>/);
  const actions = page.slice(page.indexOf('billing-card-actions'));
  assert.match(actions, /canPay && \(\s*<button[^>]*billing-btn--primary/, 'Pay Now only when there is something to pay');
  assert.match(actions, /<FiEye size=\{14\} \/> View details/, 'View details is on every card, outside any condition');
  assert.match(page, /className=\{`tech-job-card billing-card billing-card--\$\{badgeKey\}[^`]*`\}\s*onClick=\{openDetails\}/, 'the whole card opens the details');
  assert.match(page, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); openPayment\(\); \}\}/, 'Pay Now does not');
});

test('A4: the cards are compact on a phone and the shared staff card is untouched', () => {
  const css = src('css', 'customer.css');
  const phone = phoneBlock(css, 'BILLING CARDS');
  assert.match(phone, /\.billing-card \{ padding: 12px 14px/);
  assert.match(css, /\.billing-card \{[^}]*border-left-width: 3px/);
  assert.match(css, /\.billing-btn \{[^}]*min-height: 44px/);
  assert.match(src('css', 'staff.css'), /\.tech-job-card \{[^}]*padding: 18px 22px/, 'the shared card keeps its padding');
});

// ---- A5: the Book Service wizard on a phone

test('A5: the footer is one block: step text, then why Next is off, then Back and Next, the same on every step', () => {
  const page = src('pages', 'customer', 'book_service.jsx');
  const footer = page.slice(page.indexOf('bs-nav-row bs-footer'));
  assert.ok(footer.indexOf('bs-step-label') < footer.indexOf('bs-next-reason'), 'the step text comes first');
  assert.ok(footer.indexOf('bs-next-reason') < footer.indexOf('bs-nav-btns'), 'the reason comes before the buttons');
  assert.equal((page.match(/bs-nav-row/g) || []).length, 1, 'one footer for all five steps');
  assert.match(footer, /\{!isLast && nextProblem\(\) && \(/);
  const css = src('css', 'customer.css');
  const phone = phoneBlock(css, 'BOOK SERVICE ON A PHONE');
  assert.match(phone, /\.bs-nav-row \{[^}]*grid-template-areas: "label" "reason" "btns"[^}]*safe-area-inset-bottom/s);
  assert.match(phone, /\.bs-nav-btns \{ display: flex; gap: 12px; \}/);
  assert.match(phone, /\.bs-nav-btns > button \{ flex: 1 1 0; min-width: 0; min-height: 48px/);
  assert.match(phone, /\.bs-next-reason \{[^}]*text-align: left/);
  assert.match(css, /grid-template-areas: "reason reason" "label btns"/, 'wider screens keep the reason above one row');
});

test('A5: the problem description is at least 100 px tall on a phone, vertical resize only, and unchanged on desktop', () => {
  const css = src('css', 'customer.css');
  const phone = phoneBlock(css, 'BOOK SERVICE ON A PHONE');
  assert.match(phone, /\.bs-textarea \{ min-height: 100px; overflow-y: auto; \}/);
  assert.match(css, /\.bs-textarea \{[^}]*resize: vertical/s);
  assert.match(src('pages', 'customer', 'book_service.jsx'), /className="bs-textarea"\s*rows=\{2\}/, 'the desktop box keeps its two rows');
  assert.match(phone, /\.unit-entry-remove \{ width: 44px; height: 44px; \}/);
  assert.match(phone, /\.time-btn \{ min-height: 44px; \}/);
});

test('A5: one spacing rhythm for every field group, defined once', () => {
  const css = src('css', 'customer.css');
  assert.match(css, /\.bs-card \{\s*--bs-gap-label: 8px;\s*--bs-gap-hint: 8px;\s*--bs-gap-inputs: 12px;\s*--bs-gap-group: 20px;/);
  assert.match(css, /\.bs-field-group \{\s*display: flex;\s*flex-direction: column;\s*gap: var\(--bs-gap-label\);\s*margin-bottom: var\(--bs-gap-group\);/);
  assert.match(css, /\.bs-card > \.bs-two-col \{ margin-bottom: var\(--bs-gap-group\); row-gap: var\(--bs-gap-group\); \}/, 'Date and Time keep the gap below them when stacked');
  assert.match(css, /\.bs-field-group \.bs-two-col \{ gap: var\(--bs-gap-inputs\); \}/);
  const phone = phoneBlock(css, 'BOOK SERVICE ON A PHONE');
  assert.match(phone, /\.bs-card \{ --bs-gap-group: 24px; \}/);
  assert.match(phone, /\.bs-card \.closure-upcoming \{ margin: var\(--bs-gap-hint\) 0 calc\(var\(--bs-gap-hint\) - var\(--bs-gap-group\)\); \}/);
  assert.match(src('css', 'components', 'closures.css'), /\.closure-upcoming \{ margin: 6px 0 0;/, 'the shared helper line is unchanged elsewhere');
});

// ---- A6: the booking details actions

test('A6: on a phone the action buttons are one right aligned column of equal width, 44 px tall, 12 px apart', () => {
  const css = src('css', 'customer.css');
  const phone = phoneBlock(css, 'BOOKING DETAILS ACTIONS ON A PHONE');
  assert.match(phone, /\.booking-actions \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, max-content\); gap: 12px/);
  assert.match(phone, /\.booking-actions > \* \{ grid-column: 1 \/ -1; \}/, 'notes and forms take the full width');
  assert.match(phone, /\.booking-actions > button \{ grid-column: 2; width: 100%; min-height: 44px/);
  assert.match(phone, /\.booking-actions > \.cancel-booking-btn \{ margin-top: 12px; \}/);
});

test('A6: Cancel booking is the last action in the page order, with the same conditions as before', () => {
  const page = src('pages', 'customer', 'book_details.jsx');
  const group = page.slice(page.indexOf('confirmation-actions booking-actions'));
  const order = ['Reschedule', 'NoShowCustomerCard', 'DiscountRequestForm', 'FEEDBACK_ACTION_LABEL', 'View Service Report', 'Report an Issue', 'Cancel booking'].map((t) => group.indexOf(t));
  assert.ok(order.every((n) => n >= 0), 'every action is still there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Cancel booking comes last, so it is last for the keyboard too');
  assert.match(group, /BOOKING_STATUS\.IN_PROGRESS && !cancellableWhileStarted \?/, 'the started-service note is unchanged');
  assert.match(group, /onClick=\{\(\) => setShowCancel\(true\)\} disabled=\{cancelling\}/);
  assert.match(group, /\[BOOKING_STATUS\.PENDING, BOOKING_STATUS\.APPROVED\]\.includes\(booking\.status\)\s*&& !booking\.isCommercial/, 'the discount request keeps its conditions');
});
