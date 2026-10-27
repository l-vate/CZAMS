// Run with: npm test (inside server/). The supplied unit catalog and the unit choices on an installation (E13-2): the real routes and the real
// auth run, only the database is replaced. Covers the admin's catalog (add, edit, deactivate, delete, soft delete, audit), who may change
// it, what a customer is shown, the copy of the unit kept on the booking, "Not listed, ask the owner" and how it blocks approval until
// the owner settles it, and that a customer's own unit is unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { getBookingBasePrice, getPaymentBreakdown } = require('../utils/pricing');
const { toCustomerView } = require('../utils/customerView');

const { state, post, call, callPath, addBooking, addCatalogUnit, goodDate } = harness;

const install = { _id: 'S-INST', name: 'Installation', serviceType: 'Installation', price: 5000, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' },
];

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users, services: [install] }));

const asAdmin = { role: 'admin' };
const asStaff = { role: 'staff' };
const catalogCall = (method, path, as, body, opts) => callPath(method, `/api/supplied-units${path}`, as, body, opts);
const goodItem = { brand: 'Testbrand', model: 'T100', type: 'Split Type', hp: '1', inverter: true, price: 25000 };
const book = (units, extra = {}, as = 'CUS1', opts) => post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: false, units, ...extra }, as, opts);
const choose = (item, quantity = 1) => [{ type: item.type, quantity, hp: item.hp, supplied: { catalogId: item._id } }];
const notListed = (extra = {}) => [{ type: 'Split Type', quantity: 1, hp: '1', supplied: { notListed: true, brand: 'Otherbrand', notes: 'Wall mounted, white', ...extra } }];
// the id the booking was given (it is drawn at random)
const bid = () => state.bookings[0].bookingId;
const auditActions = () => state.audits.map((a) => a.action);

// ---- the admin's catalog
test('the admin adds, edits, deactivates and deletes a unit, and every change is on the audit trail', async () => {
  const created = await catalogCall('POST', '', 'ADM1', goodItem, asAdmin);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.hp, '1');
  const id = created.body._id;

  const edited = await catalogCall('PUT', `/${id}`, 'ADM1', { price: 27500 }, asAdmin);
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.price, 27500);
  assert.equal(edited.body.brand, 'Testbrand', 'what was not sent stays');

  const off = await catalogCall('PATCH', `/${id}/active`, 'ADM1', { isActive: false }, asAdmin);
  assert.equal(off.body.isActive, false);
  const on = await catalogCall('PATCH', `/${id}/active`, 'ADM1', { isActive: true }, asAdmin);
  assert.equal(on.body.isActive, true);

  const removed = await catalogCall('DELETE', `/${id}`, 'ADM1', undefined, asAdmin);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.archived, false);
  assert.equal(state.catalog.length, 0, 'a unit no booking used is removed for good');

  assert.deepEqual(auditActions(), ['supplied_unit.create', 'supplied_unit.update', 'supplied_unit.deactivate', 'supplied_unit.activate', 'supplied_unit.delete']);
  assert.equal(state.audits[1].meta.before.price, 25000);
  assert.equal(state.audits[1].actor.id, 'ADM1');
});

test('a unit that a booking used is only hidden when it is deleted, and the booking keeps its copy', async () => {
  const item = addCatalogUnit();
  assert.equal((await book(choose(item))).status, 201);
  const removed = await catalogCall('DELETE', `/${item._id}`, 'ADM1', undefined, asAdmin);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.archived, true);
  assert.equal(state.catalog.length, 1);
  assert.equal(state.catalog[0].isDeleted, true);
  assert.equal(state.catalog[0].isActive, false);
  assert.equal(state.bookings[0].units[0].supplied.brand, 'Testbrand');
  assert.deepEqual(auditActions(), ['supplied_unit.archive']);
  assert.equal((await catalogCall('GET', '', 'ADM1', undefined, asAdmin)).body.length, 0, 'it no longer shows in the admin list');
});

test('bad catalog input is refused: no brand, an unknown type, a bad horsepower, no inverter answer, a bad price, a duplicate', async () => {
  for (const bad of [{ brand: '' }, { type: 'Spaceship' }, { hp: 'two' }, { hp: '0' }, { inverter: 'yes' }, { price: -1 }, { price: 'x' }]) {
    assert.equal((await catalogCall('POST', '', 'ADM1', { ...goodItem, ...bad }, asAdmin)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await catalogCall('POST', '', 'ADM1', goodItem, asAdmin)).status, 201);
  assert.equal((await catalogCall('POST', '', 'ADM1', { ...goodItem, hp: '1.0', brand: 'TESTBRAND' }, asAdmin)).status, 409, 'the same unit again, whatever the spelling');
  assert.equal(state.catalog.length, 1);
});

test('staff and customers cannot change the catalog: 403 on every write, and staff cannot read it', async () => {
  const item = addCatalogUnit();
  for (const [as, opts] of [['STF1', asStaff], ['CUS1', undefined]]) {
    assert.equal((await catalogCall('POST', '', as, goodItem, opts)).status, 403, as);
    assert.equal((await catalogCall('PUT', `/${item._id}`, as, { price: 1 }, opts)).status, 403, as);
    assert.equal((await catalogCall('PATCH', `/${item._id}/active`, as, { isActive: false }, opts)).status, 403, as);
    assert.equal((await catalogCall('DELETE', `/${item._id}`, as, undefined, opts)).status, 403, as);
  }
  assert.equal((await catalogCall('GET', '', 'STF1', undefined, asStaff)).status, 403);
  assert.equal(state.catalog[0].price, 25000);
  assert.equal(state.audits.length, 0);
});

// ---- what a customer sees
test('a customer sees only active items, narrowed to the unit type and horsepower, and the brands that are active', async () => {
  addCatalogUnit({ brand: 'Alpha', model: 'A1', type: 'Split Type', hp: '1' });
  addCatalogUnit({ brand: 'Alpha', model: 'A15', type: 'Split Type', hp: '1.5' });
  addCatalogUnit({ brand: 'Beta', model: 'B1', type: 'Window Type', hp: '1' });
  addCatalogUnit({ brand: 'Gamma', model: 'G1', type: 'Split Type', hp: '1', isActive: false });
  addCatalogUnit({ brand: 'Delta', model: 'D1', type: 'Split Type', hp: '1', isDeleted: true });

  const all = await catalogCall('GET', '', 'CUS1');
  assert.deepEqual(all.body.map((u) => u.model).sort(), ['A1', 'A15', 'B1']);
  const split = await catalogCall('GET', '?type=Split%20Type', 'CUS1');
  assert.deepEqual(split.body.map((u) => u.model).sort(), ['A1', 'A15']);
  const splitOne = await catalogCall('GET', '?type=Split%20Type&hp=1.0', 'CUS1');
  assert.deepEqual(splitOne.body.map((u) => u.model), ['A1'], '1 and 1.0 are the same horsepower');
  assert.deepEqual(Object.keys(all.body[0]).sort(), ['_id', 'brand', 'hp', 'inverter', 'isActive', 'model', 'price', 'type']);

  assert.deepEqual((await catalogCall('GET', '/brands', 'CUS1')).body.brands, ['Alpha', 'Beta']);
  assert.equal((await catalogCall('GET', '', 'ADM1', undefined, asAdmin)).body.length, 4, 'the admin also sees the inactive item, not the deleted one');
});

test('an empty catalog gives an empty list, never an error', async () => {
  assert.deepEqual((await catalogCall('GET', '', 'CUS1')).body, []);
  assert.deepEqual((await catalogCall('GET', '/brands', 'CUS1')).body.brands, []);
});

// ---- the copy kept on the booking
test('choosing a catalog unit copies its details onto the booking and adds its price to the total', async () => {
  const item = addCatalogUnit({ price: 25000 });
  const res = await book(choose(item, 2));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const unit = state.bookings[0].units[0];
  assert.equal(unit.supplied.source, 'catalog');
  assert.equal(unit.supplied.catalogId, item._id);
  assert.equal(unit.supplied.brand, 'Testbrand');
  assert.equal(unit.supplied.model, 'T100');
  assert.equal(unit.supplied.type, 'Split Type');
  assert.equal(unit.supplied.hp, '1');
  assert.equal(unit.supplied.inverter, true);
  assert.equal(unit.supplied.price, 25000);
  assert.equal(unit.brandModel, 'Testbrand T100 (inverter)');
  // 2 units of installation at 5000, plus 2 units at 25000; the down payment still works off the installation only
  const booking = { ...state.bookings[0], service: install };
  assert.equal(getBookingBasePrice(booking), 10000 + 50000);
  assert.equal(getPaymentBreakdown(booking).downPayment, 5000);
});

test('a later catalog edit or deactivation never changes a booking that already exists', async () => {
  const item = addCatalogUnit({ price: 25000 });
  await book(choose(item));
  const before = JSON.stringify(state.bookings[0].units[0].supplied);
  const totalBefore = getBookingBasePrice({ ...state.bookings[0], service: install });

  await catalogCall('PUT', `/${item._id}`, 'ADM1', { brand: 'Renamed', model: 'Z9', price: 99999, hp: '2', inverter: false }, asAdmin);
  await catalogCall('PATCH', `/${item._id}/active`, 'ADM1', { isActive: false }, asAdmin);

  assert.equal(JSON.stringify(state.bookings[0].units[0].supplied), before);
  assert.equal(getBookingBasePrice({ ...state.bookings[0], service: install }), totalBefore);
  assert.equal(state.bookings[0].units[0].supplied.price, 25000);
});

test('a catalog choice must exist, be active, and match the unit type and horsepower', async () => {
  const item = addCatalogUnit();
  const other = addCatalogUnit({ model: 'W1', type: 'Window Type' });
  const off = addCatalogUnit({ model: 'OFF', isActive: false });
  const wrongHp = addCatalogUnit({ model: 'HP2', hp: '2' });
  const attempts = [
    [{ type: 'Split Type', quantity: 1, hp: '1', supplied: { catalogId: '999999999999999999999999' } }, /no longer on the list/],
    [{ type: 'Split Type', quantity: 1, hp: '1', supplied: { catalogId: 'not-an-id' } }, /no longer on the list/],
    [choose(off), /no longer on the list/],
    [[{ type: 'Split Type', quantity: 1, hp: '1', supplied: { catalogId: other._id } }], /does not match/],
    [[{ type: 'Split Type', quantity: 1, hp: '1', supplied: { catalogId: wrongHp._id } }], /does not match/],
    [[{ type: 'Split Type', quantity: 1, hp: '1', supplied: {} }], /Choose a unit from the list/],
  ];
  for (const [units, message] of attempts) {
    const res = await book(Array.isArray(units) ? units : [units]);
    assert.equal(res.status, 400, JSON.stringify(units));
    assert.match(res.body.message, message);
  }
  assert.equal(state.bookings.length, 0);
  assert.equal((await book(choose(item))).status, 201);
});

test('every unit entry on the booking needs its own choice', async () => {
  const split = addCatalogUnit();
  const win = addCatalogUnit({ model: 'W1', type: 'Window Type', hp: '1.5' });
  const units = [
    { type: 'Split Type', quantity: 1, hp: '1', supplied: { catalogId: split._id } },
    { type: 'Window Type', quantity: 2, hp: '1.5', supplied: {} },
  ];
  assert.equal((await book(units)).status, 400);
  units[1].supplied = { catalogId: win._id };
  assert.equal((await book(units)).status, 201);
  assert.equal(state.bookings[0].units.length, 2);
});

// ---- not listed, ask the owner
test('"Not listed" books the unit as a request with no price and a flag for the owner', async () => {
  const res = await book(notListed());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.status, 'Pending');
  const s = state.bookings[0].units[0].supplied;
  assert.equal(s.source, 'requested');
  assert.equal(s.status, 'Pending');
  assert.equal(s.price, undefined);
  assert.equal(s.request.brand, 'Otherbrand');
  assert.equal(s.request.notes, 'Wall mounted, white');
  assert.equal(s.request.hp, '1');
  assert.equal(getBookingBasePrice({ ...state.bookings[0], service: install }), 5000, 'no unit price until the owner confirms one');
});

test('a "Not listed" request needs a brand or a note, and is kept short', async () => {
  assert.equal((await book([{ type: 'Split Type', quantity: 1, brand: '', supplied: { notListed: true } }])).status, 400, 'a unit with no brand is refused first');
  assert.equal((await book(notListed({ notes: 'x'.repeat(301) }))).status, 400);
  assert.equal((await book([{ type: 'Split Type', quantity: 1, supplied: { notListed: true, notes: 'Any inverter split type' } }])).status, 201);
});

test('the booking cannot be approved while a unit request is open, and can once the owner picks a catalog unit', async () => {
  await book(notListed());
  const blocked = await call('PATCH', `/${bid()}/admin-update`, 'ADM1', { status: 'Approved' }, asAdmin);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /needs owner confirmation/);
  assert.equal(state.bookings[0].status, 'Pending');

  const item = addCatalogUnit({ price: 31000 });
  const resolved = await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { catalogId: item._id }, asAdmin);
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  const s = state.bookings[0].units[0].supplied;
  assert.equal(s.source, 'catalog');
  assert.equal(s.price, 31000);
  assert.equal(s.status, 'Resolved');
  assert.equal(s.request.brand, 'Otherbrand', 'what the customer asked for stays on the record');
  assert.equal(getBookingBasePrice({ ...state.bookings[0], service: install }), 5000 + 31000);

  const approved = await call('PATCH', `/${bid()}/admin-update`, 'ADM1', { status: 'Approved' }, asAdmin);
  assert.doesNotMatch(approved.body.message || '', /owner confirmation/);
});

test('the owner can settle a request with a unit price and a note instead of a catalog unit', async () => {
  await book(notListed());
  assert.equal((await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { price: 18000 }, asAdmin)).status, 400, 'a price needs a note');
  assert.equal((await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { price: -5, note: 'quoted by phone' }, asAdmin)).status, 400);
  const res = await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { price: 18000, note: 'Quoted by the supplier' }, asAdmin);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const s = state.bookings[0].units[0].supplied;
  assert.equal(s.source, 'manual');
  assert.equal(s.price, 18000);
  assert.equal(s.adminNote, 'Quoted by the supplier');
  assert.equal(getBookingBasePrice({ ...state.bookings[0], service: install }), 5000 + 18000);
  const customerSees = toCustomerView({ ...state.bookings[0], service: install, toObject: undefined }).units[0].supplied;
  assert.equal(customerSees.price, 18000);
  assert.equal(customerSees.adminNote, undefined, 'the admin note is not for the customer');
  assert.equal(customerSees.resolvedBy, undefined);
});

test('the owner can decline a request with a reason: the booking still cannot be approved and the customer is told', async () => {
  await book(notListed());
  assert.equal((await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { decline: true }, asAdmin)).status, 400, 'a reason is needed');
  const res = await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { decline: true, reason: 'We do not carry that brand' }, asAdmin);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(state.bookings[0].units[0].supplied.status, 'Declined');
  const blocked = await call('PATCH', `/${bid()}/admin-update`, 'ADM1', { status: 'Approved' }, asAdmin);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /declined/);
  const note = state.notes.find((n) => n.type === 'unit_request_declined');
  assert.ok(note);
  assert.equal(note.user, 'CUS1');
  assert.match(note.message, /We do not carry that brand/);
  const shown = toCustomerView({ ...state.bookings[0], service: install, toObject: undefined }).units[0].supplied;
  assert.equal(shown.declineReason, 'We do not carry that brand');
});

test('the customer is told in the app when a request is settled, and it is audited', async () => {
  await book(notListed());
  const item = addCatalogUnit({ price: 31000 });
  await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { catalogId: item._id }, asAdmin);
  const note = state.notes.find((n) => n.type === 'unit_request_resolved');
  assert.equal(note.user, 'CUS1');
  assert.match(note.message, /₱31,000 each/);
  assert.match(note.message, /The total for your booking is now ₱36,000/);
  assert.deepEqual(auditActions(), ['unit_request.resolve']);
  assert.equal(state.audits[0].meta.how, 'catalog');
});

test('only an admin settles a request, only on a Pending booking, and only for a unit that has one', async () => {
  await book(notListed());
  assert.equal((await call('PATCH', `/${bid()}/units/0/resolve`, 'CUS1', { decline: true, reason: 'no thanks' })).status, 403);
  assert.equal((await call('PATCH', `/${bid()}/units/0/resolve`, 'STF1', { decline: true, reason: 'no thanks' }, asStaff)).status, 403);
  assert.equal((await call('PATCH', `/${bid()}/units/5/resolve`, 'ADM1', { decline: true, reason: 'no unit here' }, asAdmin)).status, 404);
  const item = addCatalogUnit({ type: 'Window Type' });
  assert.equal((await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { catalogId: item._id }, asAdmin)).status, 400, 'a different type');
  state.bookings[0].status = 'Cancelled';
  assert.equal((await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { decline: true, reason: 'too late now' }, asAdmin)).status, 400);
});

// ---- a customer's own unit
test('a customer\'s own unit is unchanged: the waiver path, no supplied unit, no unit price', async () => {
  const item = addCatalogUnit();
  const units = [{ type: 'Split Type', quantity: 1, hp: '1', brandModel: 'My own brand', supplied: { catalogId: item._id } }];
  const noWaiver = await book(units, { clientSuppliedUnit: true });
  assert.equal(noWaiver.status, 400);
  assert.match(noWaiver.body.message, /waiver/);
  const res = await book(units, { clientSuppliedUnit: true, unitWaiverAcknowledged: true, unitWaiverName: 'Customer One' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.unitSource, 'customer');
  const unit = state.bookings[0].units[0];
  assert.equal(unit.supplied, undefined, 'a customer unit carries no supplied unit even if one was sent');
  assert.equal(unit.brandModel, 'My own brand');
  assert.equal(getBookingBasePrice({ ...state.bookings[0], service: install }), 5000);
});

test('other services are untouched: no unit choice is asked for or kept', async () => {
  harness.reset({ users, services: [install, { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }] });
  const res = await post({ service: 'S-CLEAN', date: goodDate(9) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].units[0].supplied, undefined);
});

test('switching an installation to the customer\'s own unit drops the supplied unit and its price', async () => {
  const item = addCatalogUnit({ price: 25000 });
  await book(choose(item));
  const unit = state.bookings[0].units[0];
  const res = await call('PATCH', `/${bid()}/admin-update`, 'ADM1', { unitSource: 'customer' }, asAdmin);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(unit.supplied === undefined || state.bookings[0].units[0].supplied === undefined, true);
  assert.equal(getBookingBasePrice({ ...state.bookings[0], service: install }), 5000);
});

test('an installation booked by an admin for a walk-in follows the same rules', async () => {
  const item = addCatalogUnit();
  const walkIn = await book(choose(item), { customer: 'CUS1' }, 'ADM1', asAdmin);
  assert.equal(walkIn.status, 201, JSON.stringify(walkIn.body));
  assert.equal(state.bookings[0].units[0].supplied.price, 25000);
  addBooking({ bookingId: 'CZ-X', customer: 'CUS1', service: install, status: 'Pending', units: [{ type: 'Split Type', quantity: 1 }] });
  assert.equal((await book([{ type: 'Split Type', quantity: 1, hp: '1', supplied: {} }], { customer: 'CUS1' }, 'ADM1', asAdmin)).status, 400);
});
