// Run with: npm test (inside server/). E30, the findings of the IT expert evaluator. The rules are read from the source files and the pure
// helpers are loaded through Vite; nothing here needs a database or the real clock.
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

// ---- 1: the capacity label

test('HP: every capacity is shown as "<value> HP", with nothing cut or rounded', async () => {
  const { hpLabel } = await vite.ssrLoadModule('/src/utils/hpLabel.js');
  const { HP_OPTIONS } = await vite.ssrLoadModule('/src/constants/unitOptions.js');
  assert.equal(hpLabel('0.75'), '0.75 HP');
  assert.equal(hpLabel('10.0'), '10.0 HP');
  assert.equal(hpLabel(1.5), '1.5 HP');
  assert.equal(hpLabel('2 HP'), '2 HP', 'no second HP');
  assert.equal(hpLabel(''), '');
  assert.equal(hpLabel(undefined), '');
  HP_OPTIONS.forEach((hp) => assert.equal(hpLabel(hp), `${hp} HP`));
});

test('HP: the booking form, summary, receipt, admin and unit pages all use the one label, and the select box is wide enough', () => {
  [['pages', 'customer', 'book_service.jsx'], ['pages', 'customer', 'book_details.jsx'], ['components', 'receipt_modal.jsx'],
    ['components', 'admin_service_details_modal.jsx'], ['components', 'unit_request_panel.jsx'], ['components', 'supplied_unit_picker.jsx'],
    ['pages', 'admin', 'supplied_units.jsx'], ['utils', 'suppliedUnitChoice.js']].forEach((file) => {
    const text = src(...file);
    assert.match(text, /hpLabel/, `${file.join('/')} uses hpLabel`);
    assert.doesNotMatch(text, /\$\{[a-z.]*hp\} HP/, `${file.join('/')} builds no HP text by hand`);
  });
  const css = src('css', 'customer.css');
  assert.match(css, /grid-template-columns: 1\.2fr 70px 1\.4fr minmax\(136px, auto\) auto auto;/);
  assert.match(css, /\.unit-entry-hp \.below-select-box \{ min-width: 120px; text-overflow: clip; \}/);
});

// ---- 2: names

test('Names: the server accepts letters, accents, spaces, hyphens, apostrophes and periods, and refuses digits and symbols', () => {
  const { validateRegistration, validateProfileUpdate } = require('../utils/accountInput');
  const ok = { email: 'ana@example.test', phone: '09171234567', password: 'abcdefg1!' };
  const accept = [['Ana', 'Dela Cruz'], ['Jose Maria', "O'Brien"], ['Zoë', 'Muñoz-Peña'], ['Ma.', 'Reyes Jr.'], ['André', 'Núñez']];
  accept.forEach(([firstName, lastName]) => {
    assert.equal(validateRegistration({ firstName, lastName, ...ok }), null, `${firstName} ${lastName}`);
    assert.equal(validateProfileUpdate({ firstName, lastName, email: ok.email, phone: ok.phone }), null);
  });
  const refuse = [['Macaroni 85', 'Reyes'], ['Ana', 'R3yes'], ['Ana', 'Reyes!'], ['<b>Ana</b>', 'Reyes'], ['Ana', '@reyes'], ['-Ana', 'Reyes'], ['Ana', '85']];
  refuse.forEach(([firstName, lastName]) => {
    const a = validateRegistration({ firstName, lastName, ...ok });
    const b = validateProfileUpdate({ firstName, lastName, email: ok.email, phone: ok.phone });
    [a, b].forEach((problem) => {
      assert.ok(problem, `${firstName} ${lastName} is refused`);
      assert.equal(problem.status, 400);
      assert.match(problem.message, /can only have letters, spaces, hyphens, apostrophes and periods/);
    });
  });
});

test('Names: the account keeps the two parts it was entered as, on register, profile edit and every user answer', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'authRoutes.js'), 'utf8');
  assert.match(routes, /firstName: firstName\.trim\(\),\s+lastName: lastName\.trim\(\),/);
  assert.match(routes, /user\.firstName = firstName\.trim\(\);\s+user\.lastName = lastName\.trim\(\);/);
  assert.equal((routes.match(/firstName: user\.firstName,/g) || []).length, 4, 'register, login, profile and photo answers');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'models', 'User.js'), 'utf8'), /firstName: String,\s+lastName: String,/);
});

test('Names: the Profile shows each part exactly as stored, and never guesses a surname from a first name', async () => {
  const { nameParts, greetingName, namePartProblem } = await vite.ssrLoadModule('/src/utils/personName.js');
  assert.deepEqual(nameParts({ name: 'Macaroni 85 Reyes', firstName: 'Macaroni 85', lastName: 'Reyes' }), { firstName: 'Macaroni 85', lastName: 'Reyes' });
  assert.deepEqual(nameParts({ name: 'Ana Dela Cruz', firstName: 'Ana', lastName: 'Dela Cruz' }), { firstName: 'Ana', lastName: 'Dela Cruz' });
  // an account without the saved parts: two words split, anything else shown whole as the first name, never a guessed surname
  assert.deepEqual(nameParts({ name: 'Juan Reyes' }), { firstName: 'Juan', lastName: 'Reyes' });
  assert.deepEqual(nameParts({ name: 'Macaroni 85 Reyes' }), { firstName: 'Macaroni 85 Reyes', lastName: '' });
  assert.deepEqual(nameParts({ name: 'Test Customer 1' }), { firstName: 'Test Customer 1', lastName: '' });
  // parts left over from before an admin changed the name are ignored
  assert.deepEqual(nameParts({ name: 'Maria Santos', firstName: 'Ana', lastName: 'Cruz' }), { firstName: 'Maria', lastName: 'Santos' });
  assert.deepEqual(nameParts(null), { firstName: '', lastName: '' });
  assert.equal(greetingName({ name: 'Macaroni 85 Reyes', firstName: 'Macaroni 85', lastName: 'Reyes' }), 'Macaroni 85');
  assert.equal(greetingName(null, 'Technician'), 'Technician');
  assert.equal(namePartProblem('First name', 'Macaroni 85'), 'First name can only have letters, spaces, hyphens, apostrophes and periods.');
  assert.equal(namePartProblem('Last name', ''), 'Last name is required.');
  assert.equal(namePartProblem('Last name', 'Núñez-Peña'), '');
});

test('Names: the forms check before sending, and the pages read the parts through one helper', () => {
  assert.match(src('pages', 'public', 'register_page.jsx'), /namePartProblem\('First name', formData\.firstName\) \|\| namePartProblem\('Last name', formData\.lastName\)/);
  assert.match(src('pages', 'customer', 'profile.jsx'), /namePartProblem\('First name', editForm\.firstName\)/);
  const staff = src('pages', 'staff', 'profile.jsx');
  assert.match(staff, /namePartProblem\('Last name', editForm\.lastName\)/);
  assert.match(staff, /htmlFor="firstName"[\s\S]*htmlFor="lastName"/, 'two fields, so no surname is cut from one box');
  assert.doesNotMatch(src('pages', 'customer', 'profile.jsx'), /\.split\(' '\)/);
  assert.doesNotMatch(staff, /\.split\(' '\)/);
  assert.match(src('utils', 'session.js'), /FRESH_FIELDS = \['name', 'firstName', 'lastName'/);
});

// ---- 3: the mode of payment

test('Payment mode: Next on the Payment step stays off, with the reason under it, until a mode is chosen (Installation included)', () => {
  const page = src('pages', 'customer', 'book_service.jsx');
  const at = page.indexOf('if (dpPercent === 0) return \'\';');
  assert.ok(at > 0);
  const rest = page.slice(at, at + 700);
  assert.match(rest, /if \(!form\.paymentMode\) return 'Choose a mode of payment for your down payment to continue\.';/);
  assert.ok(rest.indexOf('!form.paymentMode') < rest.indexOf('SERVICE_TYPE.INSTALLATION'), 'asked before the Installation shortcut');
  assert.ok(rest.indexOf('!form.paymentMode') < rest.indexOf('PAYMENT_STATUS.TO_VERIFY'), 'asked before a sent proof counts');
  assert.match(page, /\{!isLast && nextProblem\(\) && \(\s*<p className="bs-next-reason" role="status" id="bs-next-reason">/);
  assert.match(page, /disabled=\{!canNext\(\)/);
  assert.match(page, /downPaymentPercent: opt\.value, paymentMode: '', paymentMode2: ''/, 'a new down payment option clears the mode, so it is asked again');
});

// ---- 5: the customer's own invoice and receipt

test('Invoice: the customer pages read the signed in customer when they are drawn, not when the file loads', () => {
  const details = src('pages', 'customer', 'book_details.jsx');
  assert.doesNotMatch(details, /^const storedUser = /m, 'a constant read at load time is empty until a reload');
  assert.match(details, /const readStoredUser = \(\) => \{/);
  assert.match(details, /function BookDetails\(\) \{\s+const storedUser = readStoredUser\(\);/);
  assert.match(details, /customerName: storedUser\.name \|\| '-',/);
  assert.match(details, /contactNumber: booking\.contactNumber \|\| storedUser\.phone \|\| '-',/);
  const billings = src('pages', 'customer', 'billings.jsx');
  assert.match(billings, /customerName: storedUser\.name \|\| '-',/);
  assert.match(billings, /contactNumber: b\.contactNumber \|\| storedUser\.phone \|\| '-',/);
});

test('Invoice: the document shows the name, address and contact it is given, for an invoice and for a receipt', async () => {
  const { default: ReceiptModal } = await vite.ssrLoadModule('/src/components/receipt_modal.jsx');
  const { createElement } = require('node:module').createRequire(path.join(__dirname, '..', '..', 'package.json'))('react');
  const { renderToStaticMarkup } = require('node:module').createRequire(path.join(__dirname, '..', '..', 'package.json'))('react-dom/server');
  for (const isFullyPaid of [false, true]) {
    const form = {
      id: 'CZ-1', createdAt: '2026-11-03T00:00:00.000Z', customerName: 'Ana Reyes', address: '12 Maple St, Quezon City', contactNumber: '09171230001',
      service: 'Installation', lineItems: [{ type: 'Split Type', quantity: 1, hp: '0.75', subtotal: 5000 }], basePrice: 5000, toPayNow: 2500, remaining: 2500,
      downPaymentPercent: 50, paymentMode: 'GCash', isFullyPaid,
    };
    const html = renderToStaticMarkup(createElement(ReceiptModal, { form, booking: { bookingId: 'CZ-1' }, onClose() {} }));
    assert.match(html, /Customer Name:<\/span><span>Ana Reyes</);
    assert.match(html, /Address:<\/span><span>12 Maple St, Quezon City</);
    assert.match(html, /Contact Number:<\/span><span>09171230001</);
    assert.match(html, /0\.75 HP/, 'the capacity is shown in full');
  }
});

// ---- 6: View File

test('View File: a row that ends in the 44 px link is centered, on the booking page, the invoice and the receipt, on a phone and a desktop', () => {
  const customer = src('css', 'customer.css');
  assert.match(customer, /\.summary-row:has\(\.proof-link\) \{ align-items: center; \}/);
  const receipt = src('css', 'modals', 'receipt_modal.css');
  const rule = receipt.indexOf('.receipt-info-row:has(.proof-link) { align-items: center; }');
  const phoneRule = receipt.indexOf('.receipt-info-row { align-items: flex-start; }');
  assert.ok(rule > 0 && phoneRule > 0);
  // the centered row is not inside a media block, so it applies at every width, and it is more specific than the phone's top alignment
  assert.doesNotMatch(receipt.slice(0, rule).split('@media').pop().split('}').slice(0, 1).join(''), /receipt-info-row/);
  assert.match(receipt, /\.receipt-modal-card \.proof-link,\s*\.customer-dashboard-shell \.proof-link \{ display: inline-flex; align-items: center; min-height: 44px;/);
  // the customer's proof rows still use the shared link
  const details = src('pages', 'customer', 'book_details.jsx');
  assert.match(details, /<span>Proof of Payment<\/span>\s*<span className="cost-link">\s*\{booking\.proofFile \? \(\s*<ProofLink path=\{booking\.proofFile\}>View File<\/ProofLink>/);
});

// ---- 7: Log out asks first

test('Log out: every role\'s menu (desktop sidebar and phone drawer) uses the one control that asks first', () => {
  ['admin_sidebar.jsx', 'customer_sidebar.jsx', 'staff_sidebar.jsx'].forEach((file) => {
    const text = src('components', 'sidebars', file);
    assert.match(text, /import LogoutButton from '\.\.\/logout_button';/, file);
    assert.match(text, /<LogoutButton onLogout=\{handleLogout\} \/>/, file);
    assert.doesNotMatch(text, /className="sidebar-logout"/, `${file} has no Log Out button that signs out at once`);
    assert.match(text, /navigate\("?'?\/login"?'?, \{ replace: true \}\)/, `${file} ends on the login page`);
  });
});

test('Log out: the question is the shared modal, with Cancel focused, Escape closing, and the focus coming back', () => {
  const text = src('components', 'logout_button.jsx');
  assert.match(text, /Log out of CZAMS\?/);
  assert.match(text, /<button type="button" ref=\{cancelRef\} className="bs-back-btn" onClick=\{onCancel\}>Cancel<\/button>/);
  assert.match(text, /<button type="button" className="bs-next-btn" onClick=\{onConfirm\}>Log out<\/button>/);
  assert.match(text, /cancelRef\.current\?\.focus\(/, 'Cancel has the focus');
  assert.match(text, /e\.key === 'Escape'/);
  assert.match(text, /className="modal-overlay" onClick=\{onCancel\}/, 'a tap outside closes it');
  assert.match(text, /role="dialog"\s+aria-modal="true"\s+aria-labelledby="logout-dialog-title"/);
  assert.match(text, /openerRef\.current\?\.focus\(/, 'the focus goes back to the Log Out button');
  assert.match(text, /createPortal\(/, 'drawn on the page itself, so the menu\'s own stacking cannot hide it');
  assert.match(text, /onConfirm=\{\(\) => \{ setAsking\(false\); onLogout\(\); \}\}/, 'signing out only happens on the Log out button');
  // the shared modal selector is what holds the page still and traps Tab
  assert.match(src('utils', 'scrollLock.js'), /MODAL_SELECTOR = '\.modal-overlay,/);
});

test('Log out: the buttons are the same width and 44 px tall, and an automatic sign out never asks', () => {
  const css = src('css', 'components', 'sidebar.css');
  assert.match(css, /\.logout-dialog \.logout-dialog-actions \{ flex-direction: row; justify-content: flex-end;/);
  assert.match(css, /\.logout-dialog \.logout-dialog-actions button \{ flex: 0 0 140px; min-height: 44px;/);
  ['services/apiClient.js', 'utils/sessionRefresh.js'].forEach((file) => {
    const text = src(...file.split('/'));
    assert.doesNotMatch(text, /logout_button|LogoutButton|LogoutDialog/, `${file} signs out without a question`);
    assert.match(text, /clearSession\(\)/);
  });
  assert.match(src('services', 'apiClient.js'), /clearSession\(\);\s+setSessionNotice\(endMessage\);\s+window\.location\.assign\('\/login'\);/);
});
