// Run with: npm test (inside server/). The Senior Citizen / PWD discount: 20% (one named constant), only when the customer asks, only an
// admin can apply or decline it, no ID is collected, it comes off the service charge only, a payment already verified is never touched,
// and a discount that would take the total below what was paid is blocked. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { SENIOR_PWD_DISCOUNT_RATE, SENIOR_PWD_DISCOUNT_PERCENT } = require('../constants/discount');
const { getPaymentBreakdown, getBookingBasePrice } = require('../utils/pricing');

const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const people = () => [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer' },
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

test('a customer can only ask: they cannot apply or decline it, and asking does not change the price', async () => {
  const b = booking({ discount: undefined });
  const asked = await call('PATCH', '/CZ-1/discount/request', 'CUS1', { discountType: 'PWD' });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.equal(b.discount.status, 'Pending');
  assert.equal(b.discount.type, 'PWD');
  assert.equal(b.discount.idFile, undefined, 'no ID photo');
  assert.equal(b.discount.amount, undefined, 'nothing taken off yet');
  assert.equal((await call('PATCH', '/CZ-1/discount/approve', 'CUS1', {})).status, 403);
  assert.equal((await call('PATCH', '/CZ-1/discount/reject', 'CUS1', { reason: 'x' })).status, 403);
  assert.equal(b.discount.status, 'Pending');
});

test('a customer cannot ask for a kind that does not exist', async () => {
  booking({ discount: undefined });
  assert.equal((await call('PATCH', '/CZ-1/discount/request', 'CUS1', { discountType: 'Student' })).status, 400);
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
  assert.equal(saved.discount.idFile, undefined);
});
