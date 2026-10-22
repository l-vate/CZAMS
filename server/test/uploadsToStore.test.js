// Run with: npm test (inside server/). Every booking upload route writes its files to the file store (in memory here) with the right kind,
// uploader and booking id, and the stored path in the record maps to the stored name. A refused request stores nothing, a spoofed type is
// refused before anything is stored, and a booking that cannot be saved removes the files it stored. The real routes run; only the
// database and the file store are replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const harness = require('./helpers/createBooking');
const Booking = require('../models/Booking');
const { PNG_DATA_URL } = require('./helpers/signature');

const { state, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const PNG = Buffer.from(PNG_DATA_URL.split(',')[1], 'base64');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const settle = () => new Promise((resolve) => { setTimeout(resolve, 40); });
const files = async () => state.store.list();

const send = async (method, route, fields, parts, as = 'CUS1', role = 'customer') => {
  const token = jwt.sign({ id: as, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  parts.forEach(({ field, bytes = PNG, type = 'image/png' }) => form.append(field, new Blob([bytes], { type }), 'whatever-the-client-called-it.png'));
  const res = await fetch(`${harness.base()}/api/bookings${route}`, { method, headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const bookingFields = (over = {}) => ({
  service: 'S-CLEAN', units: JSON.stringify([{ type: 'Split Type', quantity: 1 }]), date: goodDate(7), time: 'Morning', address: 'Quezon City',
  contactNumber: '09171234567', downPaymentPercent: '50', paymentMode: 'GCash', referenceNumber: '1234567890123',
  lastCleanedOver6MonthsAgo: 'false', isActivelyLeaking: 'false', ...over,
});
const existing = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 1 }],
  downPaymentPercent: 50, paymentStatus: 'partially_paid', balancePaymentStatus: 'None', paymentMode: 'GCash', paymentMode2: 'GCash', ...over,
});

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer' },
    { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  ],
  services: [cleaning],
}));

test('a customer booking with a payment proof and an ID photo stores both, with their kinds, uploader and booking id', async () => {
  const res = await send('POST', '', bookingFields({ discountType: 'Senior', discountConsent: 'true' }), [{ field: 'proof' }, { field: 'discountId' }]);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const saved = state.bookings[0];
  const listed = await files();
  assert.equal(listed.length, 2);
  const byKind = Object.fromEntries(listed.map((f) => [f.metadata.kind, f]));
  assert.equal(saved.proofFile, `/uploads/proofs/${byKind.proof.name}`);
  assert.equal(saved.discount.idFile, `/uploads/proofs/${byKind.id_photo.name}`);
  listed.forEach((f) => {
    assert.match(f.name, /^[0-9a-f]{32}\.png$/);
    assert.equal(f.metadata.uploadedBy, 'CUS1');
    assert.equal(f.metadata.bookingId, saved.bookingId);
    assert.equal(f.metadata.contentType, 'image/png');
    assert.equal(f.metadata.size, PNG.length);
  });
});

test('an admin walk-in booking stores its proof under the admin as uploader', async () => {
  const res = await send('POST', '', bookingFields({ customer: 'CUS1' }), [{ field: 'proof' }], 'ADM1', 'admin');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [file] = await files();
  assert.equal(file.metadata.uploadedBy, 'ADM1');
  assert.equal(file.metadata.kind, 'proof');
  assert.equal(state.bookings[0].proofFile, `/uploads/proofs/${file.name}`);
});

test('a balance proof is stored as a proof for that booking', async () => {
  existing();
  const pay = await send('PATCH', '/CZ-1/pay-balance', { referenceNumber: '9876543210987' }, [{ field: 'proof' }]);
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  const [file] = await files();
  assert.equal(file.metadata.kind, 'proof');
  assert.equal(file.metadata.bookingId, 'CZ-1');
  assert.equal(state.bookings[0].balanceProofFile, `/uploads/proofs/${file.name}`);
});

test('a discount request stores the ID photo as an id photo for that booking', async () => {
  existing({ paymentStatus: 'Unpaid', status: 'Pending' });
  const discount = await send('PATCH', '/CZ-1/discount/request', { discountType: 'PWD', discountConsent: 'true' }, [{ field: 'discountId' }]);
  assert.equal(discount.status, 200, JSON.stringify(discount.body));
  const [file] = await files();
  assert.equal(file.metadata.kind, 'id_photo');
  assert.equal(file.metadata.bookingId, 'CZ-1');
  assert.equal(state.bookings[0].discount.idFile, `/uploads/proofs/${file.name}`);
});

test('a file that is not what it says it is is refused before anything is stored', async () => {
  existing();
  const res = await send('PATCH', '/CZ-1/pay-balance', { referenceNumber: '9876543210987' }, [{ field: 'proof', bytes: HTML }]);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /not a real/);
  const svg = await send('POST', '', bookingFields(), [{ field: 'proof', bytes: Buffer.from('<svg/>'), type: 'image/svg+xml' }]);
  assert.equal(svg.status, 400);
  await settle();
  assert.equal((await files()).length, 0);
  assert.equal(state.bookings.length, 1, 'only the booking this test added; the refused one made none');
});

test('a booking that cannot be saved removes the files it stored', async () => {
  const real = Booking.create;
  Booking.create = async () => { throw new Error('the database is down'); };
  try {
    const res = await send('POST', '', bookingFields({ discountType: 'Senior', discountConsent: 'true' }), [{ field: 'proof' }, { field: 'discountId' }]);
    assert.equal(res.status, 500);
    await settle();
    assert.equal((await files()).length, 0, 'the rollback removed both files');
  } finally {
    Booking.create = real;
  }
});

test('a booking refused for its own rules stores nothing', async () => {
  const res = await send('POST', '', bookingFields({ date: goodDate(0) }), [{ field: 'proof' }]);
  assert.equal(res.status, 400);
  await settle();
  assert.equal((await files()).length, 0);
});
