// Run with: npm test (inside server/). The optional Model number on a unit: stored with the unit (at most 30 characters), shown to the admin,
// the assigned technicians and the customer's own booking; a unit without one is unchanged. Unit type, HP and Brand are lists already.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');
const Booking = require('../models/Booking');
const { toTechnicianView } = require('../utils/technicianView');
const { toCustomerView } = require('../utils/customerView');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const root = path.join(__dirname, '..', '..');
const unit = (extra) => ({ type: 'Split Type', quantity: 1, brand: 'Daikin', brandModel: 'Daikin', hp: '1.5', ...extra });
const problems = (u) => new Booking({ units: [u] }).validateSync()?.errors || {};

test('the unit keeps a model number up to 30 characters and refuses a longer one', () => {
  assert.equal(problems(unit({ modelNumber: 'M'.repeat(30) }))['units.0.modelNumber'], undefined);
  assert.ok(problems(unit({ modelNumber: 'M'.repeat(31) }))['units.0.modelNumber']);
});

test('a unit without a model number is as before', () => {
  const b = new Booking({ units: [unit()] });
  assert.equal(b.units[0].modelNumber, undefined);
  assert.equal(problems(unit())['units.0.modelNumber'], undefined);
});

test('the technician and the customer views carry the model number', () => {
  const booking = { _id: 'a', bookingId: 'CZ-1', units: [unit({ modelNumber: 'FTKC35' })], customer: { _id: 'c' } };
  assert.equal(toTechnicianView(booking).units[0].modelNumber, 'FTKC35');
  assert.equal(toCustomerView(booking).units[0].modelNumber, 'FTKC35');
  assert.equal(toTechnicianView({ ...booking, units: [unit()] }).units[0].modelNumber, undefined);
});

test('the one-line unit summary a technician sees includes the model number', async () => {
  const { getUnitsSummary } = await vite.ssrLoadModule('/src/utils/bookingPricing.js');
  const booking = { units: [unit({ modelNumber: 'FTKC35' })] };
  assert.match(getUnitsSummary(booking, { withBrand: true }), /1× Split Type \(Daikin, Model FTKC35\)/);
  assert.equal(getUnitsSummary({ units: [unit()] }, { withBrand: true }), '1× Split Type (Daikin)');
});

test('the booking form has an optional model number box limited to 30, and the admin details show it', () => {
  const form = fs.readFileSync(path.join(root, 'src', 'pages', 'customer', 'book_service.jsx'), 'utf8');
  assert.match(form, /placeholder="Model number \(optional\)"[\s\S]*?maxLength=\{LIMITS\.modelNumber\}/);
  assert.equal(require('../constants/inputLimits.json').modelNumber, 30);
  const admin = fs.readFileSync(path.join(root, 'src', 'components', 'admin_service_details_modal.jsx'), 'utf8');
  assert.match(admin, /Model \$\{li\.modelNumber\}/);
});

test('unit type, HP and brand are lists on the form (HP has Not sure); brand has Other with a text box', () => {
  const form = fs.readFileSync(path.join(root, 'src', 'pages', 'customer', 'book_service.jsx'), 'utf8');
  assert.match(form, /ariaLabel="Unit type"/);
  assert.match(form, /HP_OPTIONS\.map/);
  assert.match(form, /OTHER_BRAND/);
});
