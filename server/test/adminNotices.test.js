// Run with: npm test (inside server/). Every active admin is told, once each, about what needs action: a new booking, a
// payment proof to verify (down payment and balance), a customer cancelling (with or without a refund), and a customer's
// refund flag. A booking an admin made for a walk-in is not announced. Each notification names the booking, and a click
// opens that booking (or Chat for a message). The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const jwt = require('jsonwebtoken');
const harness = require('./helpers/createBooking');
const { PNG_DATA_URL } = require('./helpers/signature');

const { state, post, call, addBooking } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const toAdmins = (type) => state.notes.filter((n) => n.type === type).map((n) => n.user).sort();

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
    { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
    { _id: 'ADM2', role: 'admin', isActive: true, name: 'Admin Two' },
    { _id: 'ADM3', role: 'admin', isActive: false, name: 'Retired Admin' },
  ],
  services: [cleaning],
}));

const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }],
  downPaymentPercent: 50, paymentStatus: 'Unpaid', paymentMode: 'GCash', paymentMode2: 'GCash', balancePaymentStatus: 'None', date: '2026-12-10', time: 'Morning', ...over,
});

test('a new booking from a customer tells every active admin once, naming the booking', async () => {
  const res = await post({});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(toAdmins('booking_new'), ['ADM1', 'ADM2'], 'the deactivated admin is not told');
  const note = state.notes.find((n) => n.type === 'booking_new');
  assert.equal(note.relatedBookingId, res.body.bookingId);
});

test('a booking an admin made for a walk-in is not announced to the admins', async () => {
  const res = await post({ customer: 'CUS1' }, 'ADM1', { role: 'admin' });
  assert.equal(res.status, 201);
  assert.deepEqual(toAdmins('booking_new'), []);
});

test('a payment proof sent by the customer tells every admin once, for the down payment and for the balance', async () => {
  booking();
  const token = jwt.sign({ id: 'CUS1', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const send = async (route) => {
    const form = new FormData();
    form.append('referenceNumber', '1234567890123');
    form.append('proof', new Blob([Buffer.from(PNG_DATA_URL.split(',')[1], 'base64')], { type: 'image/png' }), 'proof.png');
    const res = await fetch(`${harness.base()}/api/bookings/CZ-1/${route}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
    return res.status;
  };
  assert.equal(await send('pay'), 200);
  assert.deepEqual(toAdmins('payment_submitted'), ['ADM1', 'ADM2']);
  const firstProof = state.bookings[0].proofFile;
  state.bookings[0].paymentStatus = 'partially_paid';
  assert.equal(await send('pay-balance'), 200);
  assert.deepEqual(toAdmins('payment_submitted'), ['ADM1', 'ADM1', 'ADM2', 'ADM2'], 'one more each, for the balance');
  [firstProof, state.bookings[0].balanceProofFile].forEach((file) => {
    if (file) fs.rmSync(path.join(__dirname, '..', file.replace('/uploads/', 'uploads/')), { force: true });
  });
});

test('a customer cancelling without a refund tells every admin once; with a refund waiting, the refund notice covers it', async () => {
  booking({ status: 'Pending' });
  assert.equal((await call('PATCH', '/CZ-1/cancel', 'CUS1')).status, 200);
  assert.deepEqual(toAdmins('booking_cancelled'), ['ADM1', 'ADM2', 'CUS1']);
  assert.deepEqual(toAdmins('refund_requested'), []);

  harness.reset({ users: state.users, services: state.services });
  booking({ status: 'Pending', paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  assert.equal((await call('PATCH', '/CZ-1/cancel', 'CUS1')).status, 200);
  assert.deepEqual(toAdmins('refund_requested'), ['ADM1', 'ADM2']);
  assert.deepEqual(toAdmins('booking_cancelled'), ['CUS1'], 'admins not told twice (only the customer confirmation remains)');
});

test('a customer flagging a refund tells every admin once', async () => {
  booking({ status: 'Cancelled', refund: { status: 'Processed' } });
  const res = await call('PATCH', '/CZ-1/refund/flag', 'CUS1', { message: 'Still waiting for my money' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(toAdmins('refund_flagged'), ['ADM1', 'ADM2']);
  const again = await call('PATCH', '/CZ-1/refund/flag', 'CUS1', { message: 'Again' });
  assert.equal(again.status, 400);
  assert.deepEqual(toAdmins('refund_flagged'), ['ADM1', 'ADM2'], 'the repeat added nothing');
});

test('nothing is announced when the action is refused', async () => {
  booking({ status: 'Completed' });
  assert.equal((await call('PATCH', '/CZ-1/cancel', 'CUS1')).status, 400);
  assert.equal((await post({ units: [] })).status, 400);
  assert.equal(state.notes.filter((n) => n.user === 'ADM1').length, 0);
});

test('a click opens the booking, and a chat message opens Chat', async () => {
  const { adminNotificationTarget } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'notificationTarget.js')).href);
  assert.equal(adminNotificationTarget({ type: 'booking_new', relatedBookingId: 'CZ-2026-1234' }), '/admin/services/requests?booking=CZ-2026-1234');
  assert.equal(adminNotificationTarget({ type: 'payment_submitted', relatedBookingId: 'a b' }), '/admin/services/requests?booking=a%20b');
  assert.equal(adminNotificationTarget({ type: 'chat_message' }), '/admin/chat');
  assert.equal(adminNotificationTarget({ type: 'chat_message', relatedBookingId: 'CZ-1' }), '/admin/chat');
  assert.equal(adminNotificationTarget({ type: 'something' }), null);
  assert.equal(adminNotificationTarget(null), null);
});
