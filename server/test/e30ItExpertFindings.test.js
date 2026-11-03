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
