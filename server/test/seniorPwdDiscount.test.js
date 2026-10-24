// Run with: npm test (inside server/). The Senior Citizen / PWD discount: 20% (one named constant), only when the customer asks (always
// with a photo of a valid ID), only an admin can apply or decline it, it comes off the service charge only, a payment already verified is never touched,
// and a discount that would take the total below what was paid is blocked. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { REAL_PNG } = require('./helpers/images');
const harness = require('./helpers/createBooking');
const { SENIOR_PWD_DISCOUNT_RATE, SENIOR_PWD_DISCOUNT_PERCENT } = require('../constants/discount');
const { getPaymentBreakdown, getBookingBasePrice } = require('../utils/pricing');

const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const people = () => [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer' },
  { _id: 'COM1', role: 'customer', isActive: true, clientType: 'Commercial', name: 'Company' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' },
];
// 2 units at 1,000 = 2,000 service charge, 50% down payment
const booking = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', units: [{ type: 'Split Type', quantity: 2 }], date: goodDate(7), time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'Unpaid', balancePaymentStatus: 'None', discount: { type: 'Senior', status: 'Pending', requestedAt: new Date() }, ...over,
});
const asAdmin = (path, body = {}) => call('PATCH', `/CZ-1/${path}`, 'ADM1', body, { role: 'admin' });

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users: people(), services: [cleaning] }));

test('the rate is one named constant: 20%', () => {
  assert.equal(SENIOR_PWD_DISCOUNT_RATE, 0.2);
  assert.equal(SENIOR_PWD_DISCOUNT_PERCENT, 20);
});

// the customer's request is a form with the ID photo, the way the screen sends it
async function ask(fields, withId = true, as = 'CUS1') {
  const token = jwt.sign({ id: as, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const form = new FormData();
  Object.entries({ discountConsent: 'true', ...fields }).forEach(([k, v]) => { if (v !== undefined) form.append(k, v); });
  if (withId) form.append('discountId', new Blob([REAL_PNG], { type: 'image/png' }), 'id.png');
  const res = await fetch(`${harness.base()}/api/bookings/CZ-1/discount/request`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('a customer must always attach an ID photo: a request without one is refused, at booking time and afterwards', async () => {
  const b = booking({ discount: undefined });
  const noId = await ask({ discountType: 'PWD' }, false);
  assert.equal(noId.status, 400);
  assert.match(noId.body.message, /photo of a valid ID/);
  assert.equal(b.discount, undefined);
  const made = await harness.post({ discountType: 'Senior', date: goodDate(9) });
  assert.equal(made.status, 400, 'at booking time too');
  assert.match(made.body.message, /photo of a valid ID/);
});

test('a customer can only ask: they cannot apply or decline it, and asking does not change the price', async () => {
  const b = booking({ discount: undefined });
  const asked = await ask({ discountType: 'PWD' });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.equal(b.discount.status, 'Pending');
  assert.equal(b.discount.type, 'PWD');
  assert.ok(b.discount.idFile, 'the ID photo is kept');
  assert.equal(b.discount.amount, undefined, 'nothing taken off yet');
  assert.equal((await call('PATCH', '/CZ-1/discount/approve', 'CUS1', {})).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/discount/reject', 'CUS1', { reason: 'x' })).status, 403);
  assert.equal(b.discount.status, 'Pending');
});

test('a customer cannot ask for a kind that does not exist', async () => {
  booking({ discount: undefined });
  assert.equal((await ask({ discountType: 'Student' })).status, 400);
});

test('staff cannot apply or decline it', async () => {
  const b = booking();
  assert.equal((await call('PATCH', '/CZ-1/discount/approve', 'STF1', {}, { role: 'staff' })).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/discount/reject', 'STF1', { reason: 'no' }, { role: 'staff' })).status, 403);
  assert.equal(b.discount.status, 'Pending');
});

test('the admin applies it: 20% of the service charge, with who and when, and distance and mobilization fees are not discounted', async () => {
  const b = booking({ distanceAdjustment: 300, mobilizationFee: 2500 });
  const res = await asAdmin('discount/approve');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.discount.status, 'Approved');
  assert.equal(b.discount.rate, 0.2);
  assert.equal(b.discount.percent, 20);
  assert.equal(b.discount.amount, 400, '20% of the 2,000 service charge only');
  assert.equal(b.discount.reviewedBy, 'ADM1');
  assert.ok(b.discount.reviewedAt);
  assert.equal(getBookingBasePrice(b), 1600 + 300 + 2500, 'the fees are added in full');
});

test('before the down payment is verified: the down payment and the balance both follow the discounted charge', async () => {
  const b = booking();
  await asAdmin('discount/approve');
  const { total, downPayment, balance } = getPaymentBreakdown(b);
  assert.equal(total, 1600);
  assert.equal(downPayment, 800, '50% of 1,600');
  assert.equal(balance, 800);
});

test('after the down payment is verified: the amount paid stays, only the balance goes down', async () => {
  const b = booking({ paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const res = await asAdmin('discount/approve');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { total, downPayment, balance, overpaid } = getPaymentBreakdown(b);
  assert.equal(total, 1600);
  assert.equal(downPayment, 1000, 'what was paid is untouched');
  assert.equal(balance, 600, 'only the balance is reduced');
  assert.equal(overpaid, 0);
  assert.equal(b.downPaymentPaidAmount, 1000);
});

test('a discount that would take the total below what was already paid is blocked, with a pointer to the refund flow', async () => {
  const b = booking({ units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 100, paymentStatus: 'fully_paid', downPaymentPaidAmount: 1000 });
  const res = await asAdmin('discount/approve');
  assert.equal(res.status, 400);
  assert.match(res.body.message, /already paid/);
  assert.match(res.body.message, /refund flow/);
  assert.equal(b.discount.status, 'Pending', 'nothing was applied');
  assert.equal(b.discount.amount, undefined);
});

test('the admin can decline it: the booking total is unchanged, and who and when are recorded', async () => {
  const b = booking();
  const res = await asAdmin('discount/reject', { reason: 'No valid ID was shown' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.discount.status, 'Rejected');
  assert.equal(b.discount.reviewedBy, 'ADM1');
  assert.ok(b.discount.reviewedAt);
  assert.equal(getBookingBasePrice(b), 2000);
  assert.equal((await asAdmin('discount/reject', { reason: '' })).status, 400, 'a reason is needed');
});

test('applying and declining are both on the audit trail', () => {
  const specs = require('../utils/auditSpecs');
  assert.equal(typeof specs.discountApprove, 'function');
  assert.equal(typeof specs.discountReject, 'function');
  const src = require('node:fs').readFileSync(require.resolve('../utils/auditSpecs'), 'utf8');
  assert.match(src, /'discount\.approve'/);
  assert.match(src, /'discount\.reject'/);
});

test('an admin walk-in with the discount applies the constant rate on the spot', async () => {
  harness.reset({ users: [...people(), { _id: 'CUS2', role: 'customer', isActive: true, clientType: 'Residential', name: 'Walk In' }], services: [cleaning] });
  const res = await harness.post({ customer: 'CUS2', discountType: 'Senior', date: goodDate(9) }, 'ADM1', { role: 'admin' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.discount.status, 'Approved');
  assert.equal(saved.discount.rate, 0.2);
});

// ---- residential only, consent, and the ID photo's safeguards
// a new booking sent the way the form sends it, with or without the ID photo
async function create(fields, { as = 'CUS1', withId = true, role = 'customer' } = {}) {
  const token = jwt.sign({ id: as, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const form = new FormData();
  const body = {
    service: 'S-CLEAN', units: JSON.stringify([{ type: 'Split Type', quantity: 1 }]), date: goodDate(9), time: 'Morning', address: 'Quezon City',
    contactNumber: '09171234567', downPaymentPercent: '50', paymentMode: 'GCash', lastCleanedOver6MonthsAgo: 'false', isActivelyLeaking: 'false', ...fields,
  };
  Object.entries(body).forEach(([k, v]) => { if (v !== undefined) form.append(k, v); });
  if (withId) form.append('discountId', new Blob([REAL_PNG], { type: 'image/png' }), 'id.png');
  const res = await fetch(`${harness.base()}/api/bookings`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('a Commercial customer cannot ask for the discount: refused at booking, after booking and when an admin books for them', async () => {
  harness.reset({ users: [...people(), { _id: 'RET1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Return', manualClassification: 'Return' }], services: [cleaning] });
  const made = await create({ discountType: 'Senior', discountConsent: 'true' }, { as: 'COM1' });
  assert.equal(made.status, 400, JSON.stringify(made.body));
  assert.match(made.body.message, /residential customers only/);
  assert.equal(state.bookings.length, 0);
  const walkIn = await create({ discountType: 'Senior', customer: 'COM1' }, { as: 'ADM1', withId: false, role: 'admin' });
  assert.equal(walkIn.status, 400, 'an admin booking for a Commercial client cannot apply it either');
  const b = booking({ discount: undefined, isCommercial: true, customer: 'COM1' });
  const token = jwt.sign({ id: 'COM1', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const form = new FormData();
  form.append('discountType', 'PWD');
  form.append('discountConsent', 'true');
  form.append('discountId', new Blob([REAL_PNG], { type: 'image/png' }), 'id.png');
  const res = await fetch(`${harness.base()}/api/bookings/CZ-1/discount/request`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
  assert.equal(res.status, 400);
  assert.equal(b.discount, undefined);
});

test('the consent is required with the ID photo, and it is recorded with its time', async () => {
  harness.reset({ users: people(), services: [cleaning] });
  const noConsent = await create({ discountType: 'Senior', discountConsent: undefined });
  assert.equal(noConsent.status, 400);
  assert.match(noConsent.body.message, /agree/);
  const unticked = await create({ discountType: 'Senior', discountConsent: 'false' });
  assert.equal(unticked.status, 400);
  assert.equal(state.bookings.length, 0);
  const ok = await create({ discountType: 'Senior', discountConsent: 'true' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const saved = state.bookings[0];
  assert.equal(saved.discount.consentGiven, true);
  assert.ok(saved.discount.consentAt);
  assert.equal(saved.discount.status, 'Pending');
  assert.ok(saved.discount.idFile, 'the photo is kept for the owner to check');
  assert.equal(JSON.stringify(saved.discount).toLowerCase().includes('idnumber'), false, 'no ID number is stored');

  // after booking: the same two rules
  const b = booking({ discount: undefined });
  assert.equal((await ask({ discountType: 'PWD', discountConsent: undefined })).status, 400);
  assert.equal(b.discount, undefined);
  assert.equal((await ask({ discountType: 'PWD' })).status, 200);
  assert.equal(b.discount.consentGiven, true);
  assert.ok(b.discount.consentAt);
});

test('an admin walk-in needs no ID photo and no consent', async () => {
  harness.reset({ users: [...people()], services: [cleaning] });
  const res = await create({ discountType: 'Senior', customer: 'CUS1' }, { as: 'ADM1', withId: false, role: 'admin' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(state.bookings[0].discount.status, 'Approved');
});

test('the customer view of a discount carries the consent flag but never the path of the ID photo', () => {
  const { toCustomerView } = require('../utils/customerView');
  const view = toCustomerView({ bookingId: 'CZ-9', status: 'Pending', discount: { type: 'Senior', status: 'Pending', idFile: '/uploads/proofs/abc.png', consentGiven: true, reviewedBy: 'ADM1' } });
  assert.equal(view.discount.consentGiven, true);
  assert.equal('idFile' in view.discount, false);
  assert.equal('reviewedBy' in view.discount, false);
});

test('the consent line on the form is the one the server defines', () => {
  const front = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'src', 'constants', 'discountConsent.js'), 'utf8');
  const server = require('../constants/discount').ID_PHOTO_CONSENT_TEXT;
  assert.equal(front.includes('${BRAND_SHORT}'), true, 'the company name comes from the one constant');
  assert.equal(front.includes(server.replace('Cooling Zone', '${BRAND_SHORT}')), true);
});
