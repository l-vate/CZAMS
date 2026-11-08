// Run with: npm test (inside server/). E31, the findings of the evaluator: the chat scroll, the password field and the login link, the profile
// address and buttons, View File, the duplicate reference warning and a second approval of a payment. The rules are read from the source files
// and the pure helpers are loaded through Vite; nothing here needs a database or the real clock.
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

// ---- 1: the chat list

test('chat scroll: follows a new message only near the bottom or after the reader sent one; otherwise it offers the button', async () => {
  const { scrollDecision, isNearBottom } = await vite.ssrLoadModule('/src/utils/chatScroll.js');
  assert.equal(scrollDecision({ arrived: true, wasNearBottom: true, sentByMe: false }), 'bottom');
  assert.equal(scrollDecision({ arrived: true, wasNearBottom: false, sentByMe: false }), 'notify', 'scrolled up: the list does not move');
  assert.equal(scrollDecision({ arrived: true, wasNearBottom: false, sentByMe: true }), 'bottom', 'sending always goes down');
  assert.equal(scrollDecision({ arrived: false, wasNearBottom: true, sentByMe: false }), 'none', 'a refresh with nothing new does nothing');
  assert.equal(scrollDecision({ arrived: false, wasNearBottom: false, sentByMe: false }), 'none');
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 520, clientHeight: 400 }), true, '80 px from the end');
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }), false, '100 px from the end');
  assert.equal(isNearBottom(null), true);
});

test('chat scroll: the panel scrolls its own list (not the page), shows New messages, and the list can scroll at every width', () => {
  const panel = src('components', 'chat_panel.jsx');
  assert.doesNotMatch(panel, /scrollIntoView/, 'scrollIntoView on every refresh was what pulled the list down');
  assert.match(panel, /scrollDecision\(/);
  assert.match(panel, /New messages/);
  assert.match(panel, /onScroll=/);
  const css = src('index.css');
  assert.match(css, /\.chat-messages \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(css, /\.chat-new-messages \{/);
});

// ---- 2 and 3: the eye button and the Forgot password link

const ruleOf = (css, selector) => {
  const at = css.indexOf(`
${selector} {`);
  assert.notEqual(at, -1, `${selector} is styled`);
  return css.slice(at, css.indexOf('}', at));
};

test('password field: the eye button sits inside the border of the field, rounded to match, in one shared rule', () => {
  const css = src('css', 'auth.css');
  const rule = ruleOf(css, '.ap-toggle');
  assert.match(rule, /top: 1\.5px;/);
  assert.match(rule, /bottom: 1\.5px;/);
  assert.match(rule, /right: 1\.5px;/);
  assert.match(rule, /border-radius: 0 8\.5px 8\.5px 0;/, 'the corner of the field (10px) minus its border');
  assert.doesNotMatch(rule, /height: 44px|translateY/, 'no fixed 44 px height that outgrows a 38 px field');
  assert.match(css, /\.ap-card \.ap-toggle:focus-visible \{ outline-offset: -3px;/, 'the focus ring is drawn inside the button');
  assert.match(rule, /min-height: 0;/, 'the phone rule of 40 px per button does not stretch it');
  assert.match(css, /\.ap-card--wide \.ap-input--password \{ padding-right: 42px; \}/, 'the typed text stops before the eye');
  assert.match(css, /\.ap-card--wide \.ap-toggle::after \{/, 'a 44 px target on a phone without a taller field');
  // every password field uses the one component
  ['login_page', 'register_page', 'reset_password_page'].forEach((page) => assert.match(src('pages', 'public', `${page}.jsx`), /PasswordField/));
  assert.match(src('components', 'auth_fields.jsx'), /className="ap-toggle"/);
});

test('login: the Forgot password link keeps a visible focus style drawn inside its own box, which stays inside the label row', () => {
  const css = src('css', 'auth.css');
  assert.match(css, /\.ap-card \.ap-link--tap:focus-visible \{ outline-offset: -3px;/);
  const rule = ruleOf(css, '.ap-link--tap');
  assert.match(rule, /min-height: 28px;/);
  assert.doesNotMatch(rule, /margin: -10px/, 'the old box reached 10 px past the row');
  assert.match(css, /\.ap-link--tap::after \{[^}]*top: -8px;[^}]*bottom: -8px;/, 'the 44 px target is invisible');
});

// ---- 4 and 5: the Profile

test('profile: an empty address keeps the height of a filled one, in view mode', () => {
  const css = src('css', 'customer.css');
  assert.match(css, /\.profile-field div:empty::before \{ content: '\200b'; \}/, 'an empty value still has a line, so the box is as tall as the others');
  assert.match(css, /\.profile-field div \{\s*padding: 12px 16px;/, 'the same box for every value');
  // edit mode: the address input is the same bs-input as the other fields
  const profile = src('pages', 'customer', 'profile.jsx');
  const inputs = profile.match(/<input[^>]*?className="bs-input"/gs) || [];
  assert.equal(inputs.length, 4, 'first name, last name, email and phone share one input class');
  // E33: the address boxes (address_fields.jsx) use the same bs-input class
  assert.match(src('components', 'address_fields.jsx'), /className="bs-input"/);
});

test('profile: Cancel and Save Changes come after the fields, in the same order, right aligned at equal width, full width at 340 px', () => {
  const customer = src('pages', 'customer', 'profile.jsx');
  assert.ok(customer.indexOf('<AddressFields') < customer.indexOf('profile-edit-actions'), 'the buttons follow the last field');
  assert.ok(customer.indexOf('>\n                  Cancel') < customer.indexOf('Save<span'), 'Cancel first, then Save Changes');
  assert.match(customer, /aria-label="Save Changes"/);
  const css = src('css', 'customer.css');
  assert.match(css, /\.profile-page \.profile-card:has\(\.profile-grid\) \{ flex-direction: column; align-items: stretch; \}/);
  assert.match(css, /\.profile-edit-actions \{ justify-content: flex-end; \}/);
  assert.match(css, /\.profile-edit-actions button \{ flex: 0 1 150px; min-width: 0; white-space: nowrap; box-sizing: border-box; \}/);
  assert.match(css, /@media \(max-width: 340px\) \{[^@]*\.profile-page \.profile-edit-actions \{ display: grid; grid-template-columns: 1fr 1fr; width: 100%; \}/);

  const staff = src('pages', 'staff', 'profile.jsx');
  assert.ok(staff.indexOf('id="phone"') < staff.indexOf('tech-profile-edit-actions'), 'the staff buttons follow the last field');
  assert.ok(staff.indexOf('>\n              Cancel') < staff.indexOf("'Save Changes'"), 'Cancel first, then Save Changes');
  const staffCss = src('css', 'staff.css');
  assert.match(staffCss, /\.tech-profile-edit-actions \{ flex: 1 1 100%; display: flex; justify-content: flex-end; gap: 12px; \}/);
  assert.match(staffCss, /\.tech-profile-edit-actions button \{ flex: 0 1 150px; min-width: 0; white-space: nowrap; box-sizing: border-box; \}/);
  assert.match(staffCss, /\.profile-card:has\(\.tech-profile-edit-form\) \{ flex-wrap: wrap; \}/);
});

// ---- 6: View File

test('View File: the pill is a flex box that centers its label both ways, so the 44 px minimum no longer leaves the label at the top', () => {
  const css = src('css', 'customer.css');
  const at = css.indexOf('.confirmation-details-card .cost-link button {');
  const rule = css.slice(at, css.indexOf('}', at));
  assert.match(rule, /display: inline-flex;/);
  assert.match(rule, /align-items: center;/);
  assert.match(rule, /justify-content: center;/);
  assert.doesNotMatch(rule, /inline-block/);
  // the row centers the pill with its label, and the plain links on the invoice and receipt are flex-centered too
  assert.match(css, /\.summary-row:has\(\.proof-link\) \{ align-items: center; \}/);
  assert.match(src('css', 'modals', 'receipt_modal.css'), /\.proof-link \{ display: inline-flex; align-items: center; min-height: 44px;/);
  // every View File goes through the one ProofLink component
  const link = src('components', 'proof_file.jsx');
  assert.match(link, /children = 'View File'/);
});

// ---- 7: one duplicate reference warning

test('duplicate reference: one warning lists every other booking, with a cap, and the server answer is unchanged', async () => {
  const { referenceWarnings, bookingList } = await vite.ssrLoadModule('/src/utils/referenceWarning.js');
  const four = ['CZ-2026-4817', 'CZ-2026-3400', 'CZ-2026-1111', 'CZ-2026-2222'].map((bookingId) => ({ bookingId, reference: '1234567890123', method: 'GCash' }));
  const out = referenceWarnings(four);
  assert.equal(out.length, 1, 'four bookings, one warning');
  assert.equal(out[0].text, 'This GCash reference number was already used on bookings CZ-2026-4817, CZ-2026-3400 and 2 more. Check that it is not the same payment submitted twice.');
  assert.equal(referenceWarnings(four.slice(0, 1))[0].text, 'This GCash reference number was already used on booking CZ-2026-4817. Check that it is not the same payment submitted twice.');
  assert.match(referenceWarnings(four.slice(0, 2))[0].text, /bookings CZ-2026-4817 and CZ-2026-3400\./);
  assert.match(referenceWarnings(four.slice(0, 3))[0].text, /bookings CZ-2026-4817, CZ-2026-3400 and CZ-2026-1111\./);
  assert.equal(bookingList(['A', 'B', 'C', 'D', 'E']), 'A, B and 3 more');
  assert.equal(referenceWarnings([four[0], four[0]]).length, 1, 'a booking that matches on both payments is listed once');
  assert.match(referenceWarnings([{ bookingId: 'CZ-1' }])[0].text, /^This reference number was already used on booking CZ-1\./, 'no method on file');
  assert.deepEqual(referenceWarnings([]), []);
  assert.deepEqual(referenceWarnings(undefined), []);
  // the component renders from the helper and the server still sends one row per other booking
  assert.match(src('components', 'payment_reference.jsx'), /referenceWarnings\(duplicates\)\.map/);
  const server = fs.readFileSync(path.join(__dirname, '..', 'utils', 'paymentReference.js'), 'utf8');
  assert.match(server, /found\.push\(\{ bookingId: o\.bookingId, reference: match\.reference, method: match\.mode \|\| null \}\)/);
});

// ---- 8: the payment review window after a payment is verified

test('payment review: Approve and Reject only while a proof is waiting; a verified payment shows who verified it and when', async () => {
  const { paymentReviewState } = await vite.ssrLoadModule('/src/utils/paymentReview.js');
  assert.equal(paymentReviewState({ paymentStatus: 'to_verify' }).awaiting, true);
  assert.equal(paymentReviewState({ paymentStatus: 'partially_paid', balancePaymentStatus: 'to_verify' }).awaiting, true, 'a balance proof is waiting');
  const verified = paymentReviewState({
    paymentStatus: 'partially_paid',
    paymentEvents: [{ track: 'down', status: 'verified', by: { name: 'Admin One' }, at: '2026-11-05T02:30:00.000Z' }],
  });
  assert.equal(verified.awaiting, false);
  assert.equal(verified.notes[0].text, 'Down payment verified by Admin One on Nov 5, 2026, 10:30 AM');
  assert.equal(paymentReviewState({ paymentStatus: 'fully_paid' }).notes[0].text, 'Down payment verified', 'an older booking has no line');
  const rejected = paymentReviewState({ paymentStatus: 'rejected', paymentEvents: [{ track: 'down', status: 'rejected', reason: 'Wrong reference', by: { name: 'Admin One' }, at: '2026-11-05T02:30:00.000Z' }] });
  assert.equal(rejected.awaiting, false);
  assert.match(rejected.notes[0].text, /^Down payment rejected by Admin One on .+\. Reason: Wrong reference$/);
  assert.equal(paymentReviewState({ paymentStatus: 'fully_paid', balancePaymentStatus: 'paid' }).notes.length, 2);

  const page = src('pages', 'admin', 'payments.jsx');
  assert.match(page, /\{awaiting \? \(/, 'the buttons are inside the waiting branch');
  assert.ok(page.indexOf('{awaiting ? (') < page.indexOf("{submitting ? 'Processing...' : 'Approve'}"));
  assert.ok(page.indexOf("{submitting ? 'Processing...' : 'Approve'}") < page.indexOf('payment-review-outcome'));
  assert.match(page, /paymentsList\.find\(\(p\) => p\.id === selectedPayment\.id\)/, 'the window follows the fresh list after an approval');
});
