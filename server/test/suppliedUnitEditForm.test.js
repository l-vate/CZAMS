// Run with: npm test (inside server/). The Supplied Units edit form shows the horsepower the catalog item has. The server stores "1.0" as
// "1", while the horsepower box lists "1.0", so the box must pick the equal choice instead of falling back to the first one (0.5 HP).
// No database; the client files are loaded through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

test('a stored horsepower finds its choice in the horsepower list', async () => {
  const { hpChoiceFor } = await vite.ssrLoadModule('/src/utils/suppliedUnitChoice.js');
  const { HP_OPTIONS } = await vite.ssrLoadModule('/src/constants/unitOptions.js');
  assert.equal(hpChoiceFor(HP_OPTIONS, '1'), '1.0');
  assert.equal(hpChoiceFor(HP_OPTIONS, '1.5'), '1.5');
  assert.equal(hpChoiceFor(HP_OPTIONS, '0.75'), '0.75');
  assert.equal(hpChoiceFor(HP_OPTIONS, '10'), '10.0');
  assert.equal(hpChoiceFor(HP_OPTIONS, '7'), '7', 'a value with no choice is kept as it is');
  HP_OPTIONS.forEach((option) => assert.equal(hpChoiceFor(HP_OPTIONS, String(Number(option))), option));
});

test('the Supplied Units page loads the form values through that choice', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'admin', 'supplied_units.jsx'), 'utf8');
  assert.match(source, /hp: hpChoiceFor\(HP_OPTIONS, item\.hp\)/);
});

test('the form fields of the unit, scope and quotation forms stay inside their column, so they fit a phone screen', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'css', 'components', 'admin_service_details_modal.css'), 'utf8');
  assert.match(css, /\.scope-form input, \.scope-form select, \.scope-form textarea, \.scope-editor label input, \.scope-editor label textarea \{[^}]*width: 100%[^}]*min-width: 0[^}]*box-sizing: border-box/);
});

test('the payment step lists the unit the customer chose with its price, like the summary does, so the total is not a jump', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'customer', 'book_service.jsx'), 'utf8');
  const step4 = source.slice(source.indexOf('function Step4('), source.indexOf('/* ── Step 5'));
  assert.match(step4, /equipment\.map\(/);
  assert.match(step4, /Price to be confirmed/);
});

test('the payment pop-up lists the chosen unit too', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'customer', 'book_service.jsx'), 'utf8');
  assert.match(source, /lineItems: \[\.\.\.lineItems, \.\.\.equipment\.map\(/);
});
