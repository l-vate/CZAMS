// Run with: npm test (inside server/). The sign in pages (E19): the shared layout and form pieces keep the promises made for them. The pages
// are React, so these read the source files, the same way the other screen tests do, and check the colors with the WCAG ratio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'src');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
const PAGES = ['login_page.jsx', 'register_page.jsx', 'forgot_password_page.jsx', 'reset_password_page.jsx'].map((f) => `pages/public/${f}`);
const AUTH_FILES = ['components/auth_shell.jsx', 'components/auth_fields.jsx', 'css/auth.css', ...PAGES];

const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const lum = ([r, g, b]) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('all four pages render inside the one shared layout', () => {
  PAGES.forEach((file) => {
    const page = read(file);
    assert.match(page, /from '..\/..\/components\/auth_shell'/, `${file} imports AuthShell`);
    assert.match(page, /<AuthShell\b/, `${file} renders AuthShell`);
  });
  const shell = read('components/auth_shell.jsx');
  assert.match(shell, /<h1 className="ap-title">/, 'the card heading is the page heading');
  assert.match(shell, /ap-logo/);
  assert.match(shell, /\{children\}/);
});

test('the layout has no typed year, and the three facts come from the landing page config', () => {
  const shell = read('components/auth_shell.jsx');
  assert.doesNotMatch(shell, /(19|20)\d\d/, 'no year is typed into the layout');
  // the three facts come from the landing page config, so "since 2009" stays a fact and is not a copyright year
  assert.match(shell, /from '..\/config\/landingContent'/);
  assert.match(shell, /AREA_SERVED[\s\S]*SINCE_YEAR[\s\S]*HOURS_TEXT/);
});

test('the back link is an icon-only arrow with a 44 px tap target', () => {
  assert.match(read('css/auth.css'), /\.ap-back::after \{[^}]*inset: -7px/);
});

test('the fields carry the right autocomplete and input mode attributes', () => {
  const login = read('pages/public/login_page.jsx');
  assert.match(login, /autoComplete="email"/);
  assert.match(login, /inputMode="email"/);
  assert.match(login, /autoComplete="current-password"/);
  const register = read('pages/public/register_page.jsx');
  ['given-name', 'family-name', 'email', 'tel', 'new-password'].forEach((value) => assert.match(register, new RegExp(`autoComplete="${value}"`)));
  assert.match(register, /inputMode="tel"/);
  assert.match(read('pages/public/reset_password_page.jsx'), /autoComplete="new-password"/);
  assert.match(read('pages/public/forgot_password_page.jsx'), /autoComplete="email"/);
});

test('every field has a label tied to it, and the password toggle is a named, pressable button', () => {
  const fields = read('components/auth_fields.jsx');
  assert.match(fields, /<label className="ap-label" htmlFor=\{id\}>/);
  assert.match(fields, /aria-label=\{shown \? 'Hide password' : 'Show password'\}/);
  assert.match(fields, /aria-pressed=\{shown\}/);
  assert.match(fields, /<button\s+type="button"\s+className="ap-toggle"/, 'a real button that never submits the form');
});

test('the password field warns while Caps Lock is on and the field has focus', () => {
  const fields = read('components/auth_fields.jsx');
  assert.match(fields, /getModifierState\('CapsLock'\)/);
  assert.match(fields, /onKeyDown=/);
  assert.match(fields, /onKeyUp=/);
  assert.match(fields, /setCapsOn\(false\)/, 'the warning goes when the field loses focus');
  assert.match(fields, /Caps Lock is on/);
  assert.match(fields, /aria-live="polite"/);
});

test('the submit button is disabled and busy while a request is in flight, on every page', () => {
  assert.match(read('components/auth_fields.jsx'), /disabled=\{loading\}[\s\S]*aria-busy=\{loading\}/);
  assert.match(read('components/auth_fields.jsx'), /ap-spinner/);
  PAGES.forEach((file) => {
    const page = read(file);
    assert.match(page, /<SubmitButton loading=\{loading\}/, `${file} passes its loading state to the button`);
    assert.match(page, /setLoading\(true\)/);
    assert.match(page, /setLoading\(false\)/);
  });
});

test('errors appear inline in a live region, with an icon and a text label, never as an alert dialog', () => {
  const fields = read('components/auth_fields.jsx');
  assert.match(fields, /aria-live="assertive"/);
  assert.match(fields, /<FiAlertCircle/);
  assert.match(fields, /ap-sr-only">Error: /, 'a screen reader hears that it is an error, not only a red box');
  PAGES.forEach((file) => {
    const page = read(file);
    assert.doesNotMatch(page, /\balert\(/, `${file} does not use alert()`);
    assert.match(page, /<FormAlert/, `${file} shows its errors in FormAlert`);
  });
  assert.match(read('pages/public/register_page.jsx'), /setError\('Passwords do not match\.'\)/);
});

test('a wrong email and a wrong password still give the identical message, and the page shows the server text as it is', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'authRoutes.js'), 'utf8');
  assert.equal((routes.match(/'Invalid email or password'/g) || []).length, 2, 'both failures send the same words');
  const login = read('pages/public/login_page.jsx');
  assert.match(login, /err\.message \|\| 'Login failed'/);
  assert.match(login, /<FormAlert>\{error\}<\/FormAlert>/);
});

test('the reset token still leaves the address bar, and the calls of all four pages are unchanged', () => {
  const reset = read('pages/public/reset_password_page.jsx');
  assert.match(reset, /window\.location\.hash/);
  assert.match(reset, /window\.history\.replaceState\(null, '', window\.location\.pathname\)/);
  assert.match(reset, /await resetPassword\(\{ token, password \}\)/);
  assert.match(reset, /navigate\('\/login', \{ state: \{ passwordReset: true \} \}\)/);
  assert.match(read('pages/public/login_page.jsx'), /await login\(formData\)/);
  assert.match(read('pages/public/register_page.jsx'), /await register\(formData\)/);
  assert.match(read('pages/public/forgot_password_page.jsx'), /await requestPasswordReset\(email\)/);
});

test('create account and reset password share one set of live password rules', () => {
  assert.match(read('pages/public/register_page.jsx'), /<PasswordRules/);
  assert.match(read('pages/public/reset_password_page.jsx'), /<PasswordRules/);
  assert.match(read('components/auth_fields.jsx'), /passwordChecks\(password\)/);
  assert.match(read('components/auth_fields.jsx'), /\(met\)[\s\S]*\(not met\)/, 'met or not met is also said in words');
});

test('the colors on the white card reach WCAG AA, and the accent is a dark blue', () => {
  const css = read('css/auth.css');
  const pick = (name) => css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
  assert.ok(ratio(pick('--ap-ink-soft'), '#ffffff') >= 4.5, 'helper text');
  assert.ok(ratio(pick('--ap-border'), '#ffffff') >= 3, 'input border');
  assert.ok(ratio(pick('--ap-ink'), '#ffffff') >= 4.5, 'headings and the focus ring');
  assert.ok(ratio('#5f7386', '#ffffff') >= 4.5, 'placeholder');
  assert.ok(ratio('#ffffff', pick('--ap-hover')) >= 4.5, 'white on the hover button');
  assert.ok(ratio('#ffffff', pick('--ap-link')) >= 4.5, 'white on the button');
  assert.ok(ratio(pick('--ap-accent'), '#ffffff') >= 4.5, 'the accent underline and line');
  assert.ok(ratio(pick('--ap-link'), '#ffffff') >= 4.5, 'links');
  assert.ok(ratio(pick('--ap-error'), '#ffffff') >= 4.5, 'error icon and unmet rules');
  assert.ok(ratio('#7f1d17', '#fdecea') >= 4.5, 'error text');
  assert.ok(ratio('#1b5e20', '#e8f5e9') >= 4.5, 'notice text');
  assert.ok(ratio('#1e6b2a', '#ffffff') >= 4.5, 'a met rule');
  assert.ok(ratio('#7a4b00', '#ffffff') >= 4.5, 'caps lock warning');
  assert.doesNotMatch(css, /255, 107, 74|#ff6b4a|var\(--coral/i, 'no coral on the sign in pages');
});

test('no long dash appears in the files of the sign in pages', () => {
  AUTH_FILES.forEach((file) => {
    const text = read(file);
    assert.equal(text.includes('—'), false, `${file} has an em dash`);
    assert.equal(text.includes('–'), false, `${file} has an en dash`);
  });
});
