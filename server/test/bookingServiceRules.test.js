// Run with: npm test (inside server/). A booking must fit its service: the service exists and is open for booking, a
// cleaning booking uses the tier its two answers lead to (the same function the booking form uses), and every unit has
// a known type, a whole quantity from 1 to the maximum, and a price. The real route runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, post } = harness;

const services = () => [
  { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true },
  { _id: 'S-DEEP', name: 'Deep Cleaning', serviceType: 'Cleaning', price: 1500, isActive: true, hiddenFromDirectSelection: true },
  { _id: 'S-PULL', name: 'Pull-down Deep Cleaning', serviceType: 'Cleaning', price: 2500, isActive: true, hiddenFromDirectSelection: true },
  { _id: 'S-CHECK', name: 'Check-up', serviceType: 'Check-up', price: 500, isActive: true },
  { _id: 'S-LEAK', name: 'Leak Repair', serviceType: 'Leak Repair', price: 3000, isActive: true },
  { _id: 'S-OFF', name: 'Old Service', serviceType: 'Repair', price: 900, isActive: false },
  { _id: 'S-FREE', name: 'Free Thing', serviceType: 'Other', price: 0, isActive: true },
  { _id: 'S-HID', name: 'Hidden Other', serviceType: 'Other', price: 700, isActive: true, hiddenFromDirectSelection: true },
];

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }, { _id: 'ADM1', role: 'admin', isActive: true }],
  services: services(),
}));

const refused = async (fields, pattern, label) => {
  const res = await post(fields);
  assert.equal(res.status, 400, `${label}: ${JSON.stringify(res.body)}`);
  assert.match(res.body.message, pattern, label);
  assert.equal(state.bookings.length, 0, `${label}: nothing saved`);
};

test('a valid cleaning booking is accepted', async () => {
  const res = await post();
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings.length, 1);
});

// ---- the service
test('a service id that does not exist is refused, not saved with a price of 0', async () => {
  await refused({ service: 'S-NOPE' }, /does not exist/, 'missing');
});

test('an inactive service is refused', async () => {
  await refused({ service: 'S-OFF' }, /not available/, 'inactive');
});

test('a customer cannot book a hidden service or Leak Repair directly', async () => {
  await refused({ service: 'S-HID' }, /cannot be booked directly/, 'hidden');
  await refused({ service: 'S-LEAK' }, /Leak Repair is arranged/, 'leak repair');
});

test('an admin booking for a walk-in may use a hidden tier or Leak Repair', async () => {
  const hidden = await post({ service: 'S-DEEP', customer: 'CUS1' }, 'ADM1', { role: 'admin' });
  assert.equal(hidden.status, 201, JSON.stringify(hidden.body));
  const leak = await post({ service: 'S-LEAK', customer: 'CUS1' }, 'ADM1', { role: 'admin' });
  assert.equal(leak.status, 201, JSON.stringify(leak.body));
});

test('an admin booking still cannot use a service that does not exist or is inactive', async () => {
  assert.equal((await post({ service: 'S-NOPE', customer: 'CUS1' }, 'ADM1', { role: 'admin' })).status, 400);
  assert.equal((await post({ service: 'S-OFF', customer: 'CUS1' }, 'ADM1', { role: 'admin' })).status, 400);
});

test('a check-up needs no cleaning answers', async () => {
  const res = await post({ service: 'S-CHECK', lastCleanedOver6MonthsAgo: undefined, isActivelyLeaking: undefined });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

// ---- the cleaning tier
test('the tier follows the answers: regular, deep, pull-down', async () => {
  assert.equal((await post({ service: 'S-CLEAN', lastCleanedOver6MonthsAgo: false, isActivelyLeaking: false })).status, 201);
  assert.equal((await post({ service: 'S-DEEP', lastCleanedOver6MonthsAgo: true, isActivelyLeaking: false })).status, 201);
  assert.equal((await post({ service: 'S-PULL', lastCleanedOver6MonthsAgo: false, isActivelyLeaking: true })).status, 201);
  assert.equal((await post({ service: 'S-PULL', lastCleanedOver6MonthsAgo: true, isActivelyLeaking: true })).status, 201, 'leaking wins over not cleaned');
});

test('a tier that does not match the answers is refused, naming the right one', async () => {
  await refused({ service: 'S-CLEAN', isActivelyLeaking: true }, /Pull-down Deep Cleaning, not Cleaning/, 'leaking but regular');
  await refused({ service: 'S-CLEAN', lastCleanedOver6MonthsAgo: true }, /Deep Cleaning, not Cleaning/, 'old but regular');
  await refused({ service: 'S-PULL', isActivelyLeaking: false, lastCleanedOver6MonthsAgo: false }, /Cleaning, not Pull-down/, 'dearest tier with no reason');
  await refused({ service: 'S-DEEP' }, /not Deep Cleaning/, 'middle tier with no reason');
});

test('a cleaning booking without both answers is refused', async () => {
  await refused({ lastCleanedOver6MonthsAgo: undefined }, /Answer both cleaning questions/, 'one answer missing');
  await refused({ isActivelyLeaking: undefined, lastCleanedOver6MonthsAgo: undefined }, /Answer both cleaning questions/, 'both missing');
  await refused({ isActivelyLeaking: 'maybe' }, /Answer both cleaning questions/, 'odd answer');
});

test('the form and the server use the same tier function', async () => {
  const rules = await require('../utils/bookingValidation').loadRules();
  const cleaning = services().filter((s) => s.serviceType === 'Cleaning');
  assert.equal(rules.resolveCleaningTier(cleaning, false, false)._id, 'S-CLEAN');
  assert.equal(rules.resolveCleaningTier(cleaning, true, false)._id, 'S-DEEP');
  assert.equal(rules.resolveCleaningTier(cleaning, false, true)._id, 'S-PULL');
  assert.equal(rules.resolveCleaningTier([], true, true), null);
  const client = await import('../../src/constants/unitTypes.js');
  assert.deepEqual([...client.UNIT_TYPES], [...rules.UNIT_TYPES], 'one list of unit types');
  assert.equal(client.MAX_UNIT_QUANTITY, rules.MAX_UNIT_QUANTITY);
});

// ---- the units
test('a unit type that is not in the list is refused', async () => {
  await refused({ units: [{ type: 'Free text unit', quantity: 1 }] }, /Choose a unit type/, 'free text');
  await refused({ units: [{ type: '', quantity: 1 }] }, /Each unit needs a type|Choose a unit type/, 'blank');
});

test('a quantity must be a whole number from 1 to 20', async () => {
  for (const quantity of [0, -1, 1.5, 21, 100, 'abc']) {
    const res = await post({ units: [{ type: 'Split Type', quantity }] });
    assert.equal(res.status, 400, String(quantity));
  }
  assert.equal(state.bookings.length, 0);
  assert.equal((await post({ units: [{ type: 'Split Type', quantity: 20 }] })).status, 201, '20 is allowed');
  assert.equal((await post({ units: [{ type: 'Split Type', quantity: 1 }] })).status, 201);
});

test('a unit that would cost 0 is refused', async () => {
  await refused({ service: 'S-FREE', lastCleanedOver6MonthsAgo: undefined, isActivelyLeaking: undefined }, /no price/, 'zero price');
});

test('every unit type in the list is accepted', async () => {
  const rules = await require('../utils/bookingValidation').loadRules();
  const res = await post({ units: rules.UNIT_TYPES.map((type) => ({ type, quantity: 2 })) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});
