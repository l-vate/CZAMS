// Run with: npm test (inside server/). The message about a changed distance or mobilization charge says what happened (added,
// increased, lowered, removed), says "outside Quezon City" only for an address that is outside, and is sent once per change. The
// real route runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const { describeChargeChanges } = require('../utils/chargeNotice');
const harness = require('./helpers/createBooking');

const { state, call, addBooking } = harness;

const none = { distanceAdjustment: 0, mobilizationFee: 0 };

test('each kind of change is described in its own words', () => {
  const say = (before, after, outsideArea = false) => describeChargeChanges({ bookingId: 'CZ-1', before: { ...none, ...before }, after: { ...none, ...after }, outsideArea });
  assert.match(say({}, { distanceAdjustment: 300 }), /a distance-based charge of ₱300 was added\./);
  assert.match(say({ distanceAdjustment: 300 }, { distanceAdjustment: 500 }), /the distance-based charge was increased from ₱300 to ₱500\./);
  assert.match(say({ distanceAdjustment: 500 }, { distanceAdjustment: 200 }), /the distance-based charge was lowered from ₱500 to ₱200\./);
  assert.match(say({ distanceAdjustment: 200 }, {}), /the distance-based charge was removed\./);
  assert.match(say({}, { mobilizationFee: 1500 }), /a mobilization fee of ₱1,500 was added\./);
  assert.equal(say({ distanceAdjustment: 300 }, { distanceAdjustment: 300 }), null);
  assert.equal(say({}, {}), null);
});

test('it says outside Quezon City only when the address is outside', () => {
  const base = { bookingId: 'CZ-1', before: none, after: { ...none, distanceAdjustment: 300 } };
  assert.match(describeChargeChanges({ ...base, outsideArea: true }), /because the address is outside Quezon City/);
  assert.equal(describeChargeChanges({ ...base, outsideArea: false }).includes('outside Quezon City'), false);
});

test('two charges that changed are one message', () => {
  const text = describeChargeChanges({ bookingId: 'CZ-1', before: { distanceAdjustment: 100, mobilizationFee: 0 }, after: { distanceAdjustment: 0, mobilizationFee: 900 }, outsideArea: false });
  assert.match(text, /the distance-based charge was removed, and a mobilization fee of ₱900 was added\./);
});

test.describe('through the route', () => {
  const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
  test.before(() => harness.install());
  test.after(() => harness.close());
  test.beforeEach(() => harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }],
    services: [cleaning],
  }));
  const job = (over = {}) => addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', address: 'Quezon City', units: [{ type: 'Split Type', quantity: 1 }], ...over });
  const set = (body) => call('PATCH', '/CZ-1/admin-update', 'ADM1', body, { role: 'admin' });
  const messages = () => state.notes.filter((n) => n.user === 'CUS1' && n.type === 'charge_updated').map((n) => n.message);

  test('a change on a Quezon City address does not say outside; on another address it does; each change is one notification', async () => {
    job();
    assert.equal((await set({ distanceAdjustment: 300 })).status, 200);
    assert.equal(messages().length, 1);
    assert.equal(messages()[0].includes('outside'), false);

    harness.reset({ users: state.users, services: state.services });
    job({ address: 'Cebu City' });
    await set({ distanceAdjustment: 300 });
    assert.match(messages()[0], /outside Quezon City/);
    await set({ distanceAdjustment: 500 });
    await set({ distanceAdjustment: 200 });
    await set({ distanceAdjustment: 0 });
    assert.equal(messages().length, 4);
    assert.match(messages()[1], /increased from ₱300 to ₱500/);
    assert.match(messages()[2], /lowered from ₱500 to ₱200/);
    assert.match(messages()[3], /was removed/);
  });

  test('saving the same amounts again, or nothing about charges, sends nothing', async () => {
    job({ distanceAdjustment: 300 });
    await set({ distanceAdjustment: 300 });
    await set({ technicianInstructions: 'Gate code' });
    assert.deepEqual(messages(), []);
  });

  test('changing both charges in one save is one notification', async () => {
    job();
    await set({ distanceAdjustment: 300, mobilizationFee: 900 });
    assert.equal(messages().length, 1);
    assert.match(messages()[0], /distance-based charge of ₱300 was added, and a mobilization fee of ₱900 was added/);
  });
});
