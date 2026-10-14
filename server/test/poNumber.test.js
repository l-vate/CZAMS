// Run with: npm test (inside server/). The optional PO / reference number on a Commercial booking: trimmed, at most 40 characters, kept for a
// Commercial client and ignored for a Residential one. The real route runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, post } = harness;
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential' },
    { _id: 'COM1', role: 'customer', isActive: true, clientType: 'Commercial', companyName: 'Test Company', agreedPaymentTermsDays: 7 },
  ],
  services: [cleaning],
}));

test('a commercial client PO number is trimmed and kept', async () => {
  const res = await post({ poNumber: '   PO-2026-15  ' }, 'COM1');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].poNumber, 'PO-2026-15');
});

test('a PO number longer than 40 characters is cut to 40', async () => {
  const res = await post({ poNumber: 'P'.repeat(60) }, 'COM1');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].poNumber, 'P'.repeat(40));
});

test('no PO number, or only spaces, is stored as none', async () => {
  await post({}, 'COM1');
  await post({ poNumber: '    ' }, 'COM1');
  assert.deepEqual(state.bookings.map((b) => b.poNumber), [null, null]);
});

test('a residential customer cannot attach a PO number', async () => {
  const res = await post({ poNumber: 'PO-1' }, 'CUS1');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].poNumber, null);
});

test('a commercial client on agreed terms books with no down payment, and the booking carries the terms and the PO number', async () => {
  const res = await post({ downPaymentPercent: 0, poNumber: 'PO-9' }, 'COM1');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].paymentTermsDays, 7);
  assert.equal(state.bookings[0].poNumber, 'PO-9');
});

test('the same zero down payment is refused for a residential customer', async () => {
  const res = await post({ downPaymentPercent: 0 }, 'CUS1');
  assert.equal(res.status, 400);
  assert.match(res.body.message, /return customers or commercial clients on payment terms/);
  assert.equal(state.bookings.length, 0);
});
