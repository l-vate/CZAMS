// Run with: npm test (inside server/). E30: a customer's own invoice and receipt carry their own name, address and contact, and nothing of
// anyone else's. The invoice is drawn in the browser from the customer's own booking, so what the server lets a customer read is the privacy line.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, post, call, goodDate } = harness;
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Ana Reyes', phone: '09171230001' },
  { _id: 'CUS2', role: 'customer', isActive: true, clientType: 'Residential', name: 'Ben Santos', phone: '09171230002' },
];
const services = [{ _id: 'S-CLN', name: 'Regular Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }];

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users, services }));

const book = (as) => post({ service: 'S-CLN', date: goodDate(9), units: [{ type: 'Split Type', quantity: 1, hp: '0.75' }], paymentMode: 'GCash' }, as);

test('a customer reads their own booking, with the address and contact number their invoice needs', async () => {
  const made = await book('CUS1');
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const bookingId = state.bookings[0].bookingId;
  const own = await call('GET', `/${bookingId}`, 'CUS1');
  assert.equal(own.status, 200);
  assert.equal(own.body.bookingId, bookingId);
  assert.equal(own.body.address, 'Blk 1 Lot 2, Mabini St., Brgy. Holy Spirit, Quezon City, Metro Manila 1127');
  assert.equal(own.body.contactNumber, '09171234567');
});

test('a customer cannot read another customer\'s booking or invoice data, by id or in their own list', async () => {
  await book('CUS1');
  const bookingId = state.bookings[0].bookingId;
  const other = await call('GET', `/${bookingId}`, 'CUS2');
  assert.equal(other.status, 404);
  assert.doesNotMatch(JSON.stringify(other.body), /Ana Reyes|09171230001|Quezon City/);
  const list = await call('GET', '/mine', 'CUS2');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body, []);
  assert.doesNotMatch(JSON.stringify(list.body), new RegExp(bookingId));
  // and the customer's own answer never carries another account's name or phone
  const own = await call('GET', `/${bookingId}`, 'CUS1');
  assert.doesNotMatch(JSON.stringify(own.body), /Ben Santos|09171230002/);
});
