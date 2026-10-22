// Run with: npm test (inside server/). Customers pay online by GCash or Bank Transfer only, for the down payment and the balance; this is
// enforced by the server. Cash and cheque are recorded by the admin on site (record-payment), never by a customer or a technician, and
// payments already recorded in cash or by cheque still count. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const harness = require('./helpers/createBooking');
const { PNG_DATA_URL } = require('./helpers/signature');
const { amountPaid } = require('../utils/customerHistory');

const { state, call, addBooking, goodDate, base } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const PNG = Buffer.from(PNG_DATA_URL.split(',')[1], 'base64');

const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }], date: goodDate(7), time: 'Morning',
  downPaymentPercent: 50, paymentMode: 'GCash', paymentMode2: 'Bank Transfer', paymentStatus: 'Unpaid', balancePaymentStatus: 'None', ...over,
});

// a customer's payment submission, the way the form sends it: a proof file and a reference number
async function submit(path, fields = {}) {
  const token = jwt.sign({ id: 'CUS1', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const form = new FormData();
  form.append('referenceNumber', '1234567890123');
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append('proof', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  const res = await fetch(`${base()}/api/bookings/CZ-1/${path}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const record = (body, as = 'ADM1', role = 'admin') => call('PATCH', '/CZ-1/record-payment', as, body, { role });

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
    { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
    { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' },
  ],
  services: [cleaning],
}));

test('a customer cannot send a down payment in Cash or Cheque: 400, and the booking stays unpaid', async () => {
  for (const paymentMode of ['Cash', 'Cheque', 'cash ']) {
    const b = booking({ paymentMode });
    const res = await submit('pay');
    assert.equal(res.status, 400, paymentMode);
    assert.match(res.body.message, /GCash or Bank Transfer only/);
    assert.equal(b.paymentStatus, 'Unpaid');
    state.bookings.length = 0;
  }
});

test('a customer can send a down payment in GCash or Bank Transfer', async () => {
  for (const paymentMode of ['GCash', 'Bank Transfer']) {
    const b = booking({ paymentMode });
    const res = await submit('pay');
    assert.equal(res.status, 200, `${paymentMode}: ${JSON.stringify(res.body)}`);
    assert.equal(b.paymentStatus, 'to_verify');
    state.bookings.length = 0;
  }
});

test('the balance is online only too: Cash or Cheque is refused, GCash and Bank Transfer are accepted', async () => {
  for (const paymentMode2 of ['Cash', 'Cheque']) {
    const b = booking({ paymentStatus: 'partially_paid', paymentMode2 });
    const res = await submit('pay-balance');
    assert.equal(res.status, 400, paymentMode2);
    assert.match(res.body.message, /GCash or Bank Transfer only/);
    assert.equal(b.balancePaymentStatus, 'None');
    state.bookings.length = 0;
  }
  for (const paymentMode2 of ['GCash', 'Bank Transfer']) {
    const b = booking({ paymentStatus: 'partially_paid', paymentMode2 });
    const res = await submit('pay-balance');
    assert.equal(res.status, 200, `${paymentMode2}: ${JSON.stringify(res.body)}`);
    assert.equal(b.balancePaymentStatus, 'to_verify');
    state.bookings.length = 0;
  }
});

test('the admin can record a payment received in person in cash or by cheque, for the down payment and the balance', async () => {
  const b = booking();
  const dp = await record({ track: 'down', method: 'Cash', amount: 1000 });
  assert.equal(dp.status, 200, JSON.stringify(dp.body));
  assert.equal(b.paymentStatus, 'partially_paid');
  const bal = await record({ track: 'balance', method: 'Cheque', amount: 1000, reference: 'CHQ-0001' });
  assert.equal(bal.status, 200, JSON.stringify(bal.body));
  assert.deepEqual(b.paymentEvents.map((e) => [e.track, e.method, e.inPerson]), [['down', 'Cash', true], ['balance', 'Cheque', true]]);
});

test('a technician and a customer cannot record a payment in person', async () => {
  const b = booking();
  assert.equal((await record({ track: 'down', method: 'Cash', amount: 1000 }, 'STF1', 'staff')).status, 403);
  assert.equal((await record({ track: 'down', method: 'Cash', amount: 1000 }, 'CUS1', 'customer')).status, 403);
  assert.equal(b.paymentStatus, 'Unpaid');
});

test('payments already recorded in cash or by cheque still total correctly', () => {
  const paid = { service: cleaning, units: [{ type: 'Split Type', quantity: 2 }], downPaymentPercent: 50, paymentStatus: 'fully_paid', balancePaid: true, paymentMode: 'Cash', paymentMode2: 'Cheque' };
  assert.equal(amountPaid(paid), 2000);
  const half = { ...paid, paymentStatus: 'partially_paid', balancePaid: false, balancePaymentStatus: 'None' };
  assert.equal(amountPaid(half), 1000);
});
