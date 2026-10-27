// Run with: npm test (inside server/). E17-2: the brand of every unit on a new booking. It is required, Other needs text, a company-supplied
// unit is matched in the catalog by type, horsepower and brand (a match is copied with its price, no match leaves the booking Pending with the
// owner-confirmation request), the brand is a snapshot, and bookings made before the field existed are untouched. No database.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { startSsrServer } = require('./helpers/viteSsr');
const { toCustomerView } = require('../utils/customerView');
const { unitConfirmationProblem } = require('../utils/suppliedUnits');
const { readUnitBrand } = require('../utils/unitBrand');

const { state, post, addBooking, addCatalogUnit, goodDate } = harness;

const install = { _id: 'S-INST', name: 'Installation', serviceType: 'Installation', price: 5000, isActive: true };
const clean = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
];

let vite;
let closeVite;
test.before(async () => { harness.install(); ({ vite, close: closeVite } = await startSsrServer()); });
test.after(async () => { await harness.close(); await closeVite(); });
test.beforeEach(() => harness.reset({ users, services: [install, clean] }));

const supplied = (units, extra = {}) => post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: false, units, ...extra });
const own = (units) => post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: true, unitWaiverAcknowledged: true, unitWaiverName: 'Customer One', units });
// brand '' means no brand: the booking helper only adds a default brand to a unit that has none of its own
const unit = (extra = {}) => ({ type: 'Split Type', quantity: 1, hp: '1', brand: '', ...extra });

test('the brand is required on every unit, for a supplied unit, an own unit and a cleaning', async () => {
  assert.equal((await supplied([unit()])).status, 400);
  assert.equal((await own([unit()])).status, 400);
  const cleaning = await post({ service: 'S-CLEAN', units: [{ type: 'Split Type', quantity: 1, brand: '' }] });
  assert.equal(cleaning.status, 400);
  assert.match(cleaning.body.message, /brand/i);
  assert.equal(state.bookings.length, 0);
  assert.equal((await own([unit({ brand: 'Daikin' })])).status, 201);
});

test('Other needs the brand typed in, and the typed text is what is kept', async () => {
  const missing = await own([unit({ brand: 'Other' })]);
  assert.equal(missing.status, 400);
  assert.match(missing.body.message, /Type the brand/);
  assert.equal((await own([unit({ brand: 'Other', brandOther: '   ' })])).status, 400);
  assert.equal((await own([unit({ brand: 'Other', brandOther: 'x'.repeat(61) })])).status, 400);
  const ok = await own([unit({ brand: 'Other', brandOther: '  Gree  ' })]);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(state.bookings[0].units[0].brand, 'Gree');
  assert.equal(state.bookings[0].units[0].brandModel, 'Gree');
});

test('the pure rule: a list brand, Other with text, the legacy brandModel text, and the refusals', () => {
  assert.equal(readUnitBrand({ brand: 'LG' }).brand, 'LG');
  assert.equal(readUnitBrand({ brandModel: 'Carrier' }).brand, 'Carrier', 'older callers that only send brandModel still work');
  assert.equal(readUnitBrand({ brand: 'other', brandOther: 'Gree' }).brand, 'Gree');
  assert.ok(readUnitBrand({}).problem);
  assert.ok(readUnitBrand({ brand: 'Other' }).problem);
});

test('a company unit is matched by type, horsepower and brand: one match is used, with its price copied', async () => {
  const item = addCatalogUnit({ brand: 'Daikin', model: 'D1', price: 31000 });
  addCatalogUnit({ brand: 'Daikin', model: 'D2', type: 'Window Type', price: 9000 }); // another type
  addCatalogUnit({ brand: 'Daikin', model: 'D3', hp: '2', price: 40000 }); // another horsepower
  addCatalogUnit({ brand: 'LG', model: 'L1', price: 28000 }); // another brand
  addCatalogUnit({ brand: 'Daikin', model: 'D4', isActive: false, price: 1 }); // not active
  const res = await supplied([unit({ brand: 'daikin' })]);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const u = state.bookings[0].units[0];
  assert.equal(u.supplied.source, 'catalog');
  assert.equal(u.supplied.catalogId, String(item._id));
  assert.equal(u.supplied.price, 31000);
  assert.equal(u.brand, 'daikin');
  assert.equal(unitConfirmationProblem(state.bookings[0].units), null, 'nothing waits for the owner');
});

test('no match leaves the booking Pending with the unit-needs-owner-confirmation request', async () => {
  addCatalogUnit({ brand: 'LG', model: 'L1' });
  const res = await supplied([unit({ brand: 'Samsung' })]);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const b = state.bookings[0];
  assert.equal(b.status, 'Pending');
  assert.equal(b.units[0].supplied.source, 'requested');
  assert.equal(b.units[0].supplied.status, 'Pending');
  assert.equal(b.units[0].supplied.request.brand, 'Samsung');
  assert.match(unitConfirmationProblem(b.units).message, /needs owner confirmation/);
});

test('an Other brand has no catalog match, so it is flagged for the owner too', async () => {
  addCatalogUnit({ brand: 'LG' });
  const res = await supplied([unit({ brand: 'Other', brandOther: 'Gree' })]);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].units[0].supplied.request.brand, 'Gree');
});

test('several catalog units fit the brand: the customer must pick one, and a pick of another brand is refused', async () => {
  const a = addCatalogUnit({ brand: 'Daikin', model: 'D1' });
  addCatalogUnit({ brand: 'Daikin', model: 'D2', inverter: false });
  const vague = await supplied([unit({ brand: 'Daikin' })]);
  assert.equal(vague.status, 400);
  assert.match(vague.body.message, /Choose one from the list/);
  const picked = await supplied([unit({ brand: 'Daikin', supplied: { catalogId: a._id } })]);
  assert.equal(picked.status, 201, JSON.stringify(picked.body));
  const lg = addCatalogUnit({ brand: 'LG', model: 'L1' });
  const wrong = await supplied([unit({ brand: 'Daikin', supplied: { catalogId: lg._id } })], { date: goodDate(10) });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.message, /different brand/);
});

test('the booking keeps its own copy: a later catalog edit changes neither the price nor the brand', async () => {
  const item = addCatalogUnit({ brand: 'Daikin', price: 31000 });
  assert.equal((await supplied([unit({ brand: 'Daikin' })])).status, 201);
  item.price = 99999;
  item.brand = 'Renamed';
  const u = state.bookings[0].units[0];
  assert.equal(u.supplied.price, 31000);
  assert.equal(u.supplied.brand, 'Daikin');
  assert.equal(u.brand, 'Daikin');
});

test('a booking made before the brand existed is untouched and still shows its brand text', () => {
  const old = addBooking({ bookingId: 'CZ-OLD', customer: 'CUS1', service: clean, status: 'Approved', units: [{ type: 'Split Type', quantity: 1, brandModel: 'Carrier' }], date: goodDate(10), time: 'Morning', assignments: [] });
  assert.equal(old.units[0].brand, undefined);
  const view = toCustomerView(old);
  assert.equal(view.units[0].brandModel, 'Carrier');
  assert.equal(view.units[0].brand, undefined);
});

test('the form: catalog brands come first, then the common brands, and a chosen brand narrows the catalog list', async () => {
  const choice = await vite.ssrLoadModule('/src/utils/suppliedUnitChoice.js');
  const { AC_BRANDS } = await vite.ssrLoadModule('/src/constants/unitOptions.js');
  const items = [{ brand: 'Zeta', type: 'Split Type', hp: '1', _id: 'a' }, { brand: 'Daikin', type: 'Split Type', hp: '1.0', _id: 'b' }, { brand: 'Daikin', type: 'Window Type', hp: '1', _id: 'c' }];
  const options = choice.brandChoices(items, AC_BRANDS);
  assert.deepEqual(options.slice(0, 2), ['Daikin', 'Zeta'], 'the brands we supply come first');
  assert.equal(options.filter((b) => b === 'Daikin').length, 1, 'a brand is not listed twice');
  assert.ok(options.includes('Carrier'), 'the common brands follow');
  assert.deepEqual(choice.matchingUnits(items, { type: 'Split Type', hp: '1', brandModel: 'daikin' }).map((i) => i._id), ['b']);
  assert.deepEqual(choice.matchingUnits(items, { type: 'Split Type', hp: '1', brandModel: 'Samsung' }), [], 'no match: the owner will confirm');
});

test('the form sends the brand: a list choice as it is, Other with its typed text', async () => {
  const { unitsForSubmit } = await vite.ssrLoadModule('/src/utils/suppliedUnitChoice.js');
  const sent = unitsForSubmit([{ type: 'Split Type', quantity: 1, brandModel: 'LG' }, { type: 'Split Type', quantity: 1, brandModel: 'Gree', brandOther: true }], true);
  assert.equal(sent[0].brand, 'LG');
  assert.equal(sent[1].brand, 'Other');
  assert.equal(sent[1].brandOther, 'Gree');
});
