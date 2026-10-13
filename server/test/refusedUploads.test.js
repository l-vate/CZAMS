// Run with: npm test (inside server/). A file uploaded with a request that is then refused is deleted from disk: the refund route,
// the proof-of-purchase route and the booking form. A request that succeeds keeps its file. The real routes run; only the
// database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const harness = require('./helpers/createBooking');
const { PNG_DATA_URL } = require('./helpers/signature');

const { state, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const PNG = Buffer.from(PNG_DATA_URL.split(',')[1], 'base64');
const unlinked = [];
const realUnlink = fs.unlink;
const kept = [];

test.before(async () => {
  await harness.install();
  fs.unlink = (file, cb) => { unlinked.push(file); realUnlink(file, cb || (() => {})); };
});
test.after(() => {
  fs.unlink = realUnlink;
  harness.close();
  kept.forEach((file) => fs.rmSync(path.join(__dirname, '..', file.replace('/uploads/', 'uploads/')), { force: true }));
});
test.beforeEach(() => {
  unlinked.length = 0;
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer' }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }],
    services: [cleaning],
  });
});

const send = async (route, fields, as = 'ADM1', role = 'admin', field = 'proof') => {
  const token = jwt.sign({ id: as, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append(field, new Blob([PNG], { type: 'image/png' }), 'proof.png');
  const res = await fetch(`${harness.base()}/api/bookings${route}`, { method: route === '' ? 'POST' : 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const settle = () => new Promise((resolve) => { setTimeout(resolve, 40); });
const booking = (over = {}) => addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Cancelled', units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 50, ...over });

test('a refund request refused (nothing pending) deletes the uploaded proof', async () => {
  booking({ refund: { status: 'None' } });
  const res = await send('/CZ-1/refund', {});
  assert.equal(res.status, 400);
  await settle();
  assert.equal(unlinked.length, 1);
  assert.equal(path.basename(path.dirname(unlinked[0])), 'proofs');
});

test('a refund refused for a bad amount, and for a booking that does not exist, deletes the proof too', async () => {
  booking({ refund: { status: 'Pending', isSameDay: true, downPaymentAmount: 1000 } });
  assert.equal((await send('/CZ-1/refund', {})).status, 400, 'a same-day refund needs the deduction');
  assert.equal((await send('/CZ-NOPE/refund', {})).status, 404);
  await settle();
  assert.equal(unlinked.length, 2);
});

test('a refund that goes through keeps its proof', async () => {
  booking({ refund: { status: 'Pending', isSameDay: false, downPaymentAmount: 1000 } });
  const res = await send('/CZ-1/refund', {});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  await settle();
  assert.equal(unlinked.length, 0);
  kept.push(state.bookings[0].refund.proofFile);
});

test('a proof of purchase refused (no such booking) is deleted, and one that is saved is kept', async () => {
  const refused = await send('/CZ-NOPE/unit-purchase-proof', {});
  assert.equal(refused.status, 404);
  await settle();
  assert.equal(unlinked.length, 1);
  booking({ status: 'Completed' });
  const saved = await send('/CZ-1/unit-purchase-proof', {});
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  await settle();
  assert.equal(unlinked.length, 1, 'nothing more was deleted');
  kept.push(state.bookings[0].unitPurchaseProof);
});

test('a booking refused after its proof was uploaded deletes the proof', async () => {
  const res = await send('', {
    service: 'S-CLEAN', units: JSON.stringify([{ type: 'Split Type', quantity: 1 }]), date: goodDate(7), time: 'Morning', address: '', contactNumber: '09171234567',
    downPaymentPercent: '50', paymentMode: 'GCash', referenceNumber: 'GC123456', lastCleanedOver6MonthsAgo: 'false', isActivelyLeaking: 'false',
  }, 'CUS1', 'customer');
  assert.equal(res.status, 400);
  await settle();
  assert.equal(unlinked.length, 1);
  assert.equal(state.bookings.length, 0);
});
