// Run with: npm test (inside server/). Phone touch sizes, input names and text contrast (E9-7): the shared phone stylesheet is loaded last and
// only inside the phone breakpoint, the colours chosen for the fixed text styles really reach the WCAG AA ratio, the light status fills take
// dark text, and the inputs that had no accessible name now have one. The browser measurements are in docs of the audit pass; these tests keep
// the choices from slipping back.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SRC = path.join(__dirname, '..', '..', 'src');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');

const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const lum = ([r, g, b]) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('the phone stylesheet is loaded last, raises controls to 40 px, and does nothing outside the phone breakpoint', () => {
  const main = read('main.jsx');
  const imports = [...main.matchAll(/import ['"](\.\/css\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.equal(imports[imports.length - 1], './css/mobile_touch.css', 'it must come after every other stylesheet');
  const css = read('css/mobile_touch.css');
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /min-height: 40px/);
  // everything is inside the one media block: nothing before its opening brace but comments
  const outside = css.replace(/\/\*[\s\S]*?\*\//g, '').split('@media')[0].trim();
  assert.equal(outside, '', 'no rule outside the phone breakpoint');
});

test('every fixed text colour reaches 4.5:1 (or 3:1 for large text) on its background', () => {
  const pairs = [
    ['footer headings', '#488eda', '#0b2545', 4.5],
    ['dark text on the amber badge', '#0f172a', '#f59e0b', 4.5],
    ['dark text on the green badge', '#0f172a', '#22c55e', 4.5],
    ['white on the violet token', '#ffffff', '#8655f6', 4.5],
    ['violet stat label on white', '#8655f6', '#ffffff', 4.5],
    ['amber stat label on white', '#b16105', '#ffffff', 4.5],
    ['green stat label on white', '#12883e', '#ffffff', 4.5],
    ['navy on the coral button', '#0b2545', '#ff6b4a', 4.5],
    ['card price on its tint', '#0c7c7c', '#ecf6f6', 4.5],
    ['grey divider text on the page', '#6f6f6f', '#f0f4f8', 4.5],
    ['danger red on white', '#dc2626', '#ffffff', 4.5],
    ['white on the danger badge', '#ffffff', '#dc2626', 4.5],
    ['closure badge', '#d12222', '#fde8e8', 4.5],
    ['holiday badge', '#a75c05', '#fef2e1', 4.5],
    ['maintenance badge and the active sidebar link', '#2361eb', '#e9effd', 4.5],
  ];
  pairs.forEach(([name, fg, bg, need]) => assert.ok(ratio(fg, bg) >= need, `${name}: ${ratio(fg, bg).toFixed(2)}:1`));
});

test('the stylesheets use those colours', () => {
  const index = read('index.css');
  assert.match(index, /--status-progress-solid:\s*#8655f6/);
  assert.match(index, /\.sidebar-link\.active \{[^}]*color: #2361eb/);
  assert.match(read('css/public.css'), /\.footer h4 \{[^}]*color: #488eda/);
  assert.match(read('css/public.css'), /\.cta \{[^}]*color: var\(--navy\)/);
  const staff = read('css/staff.css');
  assert.match(staff, /\.tech-status-pending \{[^}]*color: #0f172a/);
  assert.match(staff, /\.tech-status-completed \{[^}]*color: #0f172a/);
  assert.match(staff, /--dimmed \.tech-job-status-badge|tech-job-card--dimmed \.tech-job-date-label/);
  assert.equal(/tech-job-card--dimmed \{\s*opacity/.test(staff), false, 'a cancelled card is not dimmed as a whole any more: that dimmed its badge');
});

test('the light status fills (amber and green) take dark text, every other fill keeps white', async () => {
  const { textOnFill, getFilterPillStyle } = await import(pathToFileURL(path.join(SRC, 'utils', 'statusColors.js')).href);
  assert.equal(textOnFill('var(--warning)'), '#0f172a');
  assert.equal(textOnFill('var(--success)'), '#0f172a');
  ['var(--danger)', 'var(--primary)', 'var(--status-progress-solid)', '#64748b', undefined].forEach((fill) => assert.equal(textOnFill(fill), undefined, String(fill)));
  assert.equal(getFilterPillStyle('Pending', true).color, '#0f172a');
  assert.equal(getFilterPillStyle('Completed', true).color, '#0f172a');
  assert.equal(getFilterPillStyle('Cancelled', true).color, undefined);
  assert.equal(getFilterPillStyle('Pending', false), undefined);
});

test('the inputs that had no accessible name have one', () => {
  for (const file of ['pages/admin/admin_layout.jsx', 'pages/customer/customer_layout.jsx']) {
    assert.match(read(file), /type="search"[\s\S]{0,200}aria-label=\{/, file);
  }
  assert.match(read('pages/staff/my_jobs.jsx'), /Search by service, booking ID, customer, or address\.\.\."\s*\n\s*aria-label=/);
  assert.match(read('components/chat_panel.jsx'), /placeholder="Type a message\.\.\."\s*\n\s*aria-label="Type a message"/);
  const settings = read('components/payment_settings_panel.jsx');
  ['Payment method name', 'Detail label for', 'Detail value for', 'Down payment option'].forEach((text) => assert.ok(settings.includes(text), text));
});
