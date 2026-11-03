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
