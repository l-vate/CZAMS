// Run with: npm test (inside server/). An Installation booking records where the unit came from (bought from Cooling Zone, or the
// customer's own): required when booking, editable by the admin only, and it sets the warranty window. The real routes run; only the
// database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, post, call, addBooking, goodDate } = harness;

const install = { _id: 'S-INST', name: 'Installation', serviceType: 'Installation', price: 5000, isActive: true };
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }, { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' }],
  services: [install, cleaning],
}));

const installation = (over = {}) => addBooking({ bookingId: 'CZ-I', customer: 'CUS1', service: install, status: 'Pending', date: goodDate(9), time: 'Morning', units: [{ type: 'Split Type', quantity: 1 }], clientSuppliedUnit: false, ...over });
const adminUpdate = (body) => call('PATCH', '/CZ-I/admin-update', 'ADM1', body, { role: 'admin' });

test('an Installation cannot be booked without saying where the unit comes from', async () => {
  const res = await post({ service: 'S-INST', date: goodDate(9) });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /where the unit comes from/);
  assert.equal(state.bookings.length, 0);
});

test('a Cooling Zone unit books as company, and the answer carries the unit source', async () => {
  const res = await post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: false }, 'ADM1', { role: 'admin' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.unitSource, 'company');
});

test('a customer unit needs the signed waiver, and books as customer', async () => {
  const noWaiver = await post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: true });
  assert.equal(noWaiver.status, 400);
  const res = await post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: true, unitWaiverAcknowledged: true, unitWaiverName: 'Customer One' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.unitSource, 'customer');
});

test('other services do not need it', async () => {
  const res = await post({ service: 'S-CLEAN', date: goodDate(9) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.unitSource, null);
});

test('the admin can change it on an Installation; the customer and a technician cannot', async () => {
  const b = installation();
  const ok = await adminUpdate({ unitSource: 'customer' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(b.clientSuppliedUnit, true);
  assert.equal(ok.body.unitSource, 'customer');
  assert.equal((await adminUpdate({ unitSource: 'company' })).status, 200);
  assert.equal(b.clientSuppliedUnit, false);
  assert.equal((await adminUpdate({ unitSource: 'somebody' })).status, 400);
  assert.equal((await call('PATCH', '/CZ-I/admin-update', 'CUS1', { unitSource: 'customer' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-I/admin-update', 'STF1', { unitSource: 'customer' }, { role: 'staff' })).status, 403);
});

test('the unit source cannot be set on a booking that is not an Installation', async () => {
  addBooking({ bookingId: 'CZ-I', customer: 'CUS1', service: cleaning, status: 'Pending', date: goodDate(9), time: 'Morning', units: [{ type: 'Split Type', quantity: 1 }] });
  const res = await adminUpdate({ unitSource: 'customer' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /only applies to an Installation/);
});
