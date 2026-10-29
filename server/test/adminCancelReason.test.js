// Run with: npm test (inside server/). The admin's Cancel Booking asks why. "We cannot supply or serve" is the owner cancelling (the whole verified
// down payment goes back, no transportation fee, on any date); "Customer request" and "Other" use the normal refund rule and only carry a reason,
// which is kept on the booking, shown to the customer and written in the audit entry. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = require('../utils/extensionDays');
const { toCustomerView } = require('../utils/customerView');

const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
];

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users, services: [cleaning] }));

const paid = (date, over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }], date, time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000, balancePaymentStatus: 'None', refund: { status: 'None' }, ...over,
});
const cancel = (body) => call('PATCH', '/CZ-1/admin-update', 'ADM1', body, { role: 'admin' });
const today = manilaTodayKey();
const DATES = { before: () => goodDate(7), on: () => today, after: () => addDays(today, -3) };

// the three requests the dialog sends
const CUSTOMER_REQUEST = { status: 'Cancelled', cancelReason: 'Customer request' };
const OTHER = { status: 'Cancelled', cancelReason: 'The customer moved away' };
const OWNER = { status: 'Cancelled', ownerInitiated: true, cancelReason: 'We do not carry that brand' };

// ---- We cannot supply or serve: the owner cancels, whatever the date

for (const [when, makeDate] of Object.entries(DATES)) {
  test(`We cannot supply or serve, ${when} the booked date: the whole verified down payment and no transportation fee`, async () => {
    const b = paid(makeDate());
    assert.equal((await cancel(OWNER)).status, 200);
    assert.equal(b.status, 'Cancelled');
    assert.equal(b.ownerCancelled, true);
    assert.equal(b.cancelReason, 'We do not carry that brand');
    assert.equal(b.refund.status, 'Pending');
    assert.equal(b.refund.ownerInitiated, true);
    assert.equal(b.refund.isSameDay, false, 'never a late cancellation');
    assert.equal(b.refund.dispatchDeduction, 0);
    assert.equal(b.refund.refundableAmount, 1000);
    assert.equal(b.refund.downPaymentAmount, 1000);
  });
}

test('We cannot supply or serve needs its details: 3 to 200 characters, or nothing is cancelled', async () => {
  const b = paid(goodDate(7));
  for (const cancelReason of [undefined, '', '  ', 'no', 'x'.repeat(201), 42]) {
    assert.equal((await cancel({ ...OWNER, cancelReason })).status, 400, String(cancelReason));
  }
  assert.equal(b.status, 'Approved');
  assert.equal(b.refund.status, 'None');
});

// ---- Customer request and Other: the normal refund rule

for (const [label, body] of [['Customer request', CUSTOMER_REQUEST], ['Other', OTHER]]) {
  test(`${label}, before the booked date: a full refund with no fee, by the normal rule (not owner-initiated)`, async () => {
    const b = paid(goodDate(7));
    assert.equal((await cancel(body)).status, 200);
    assert.equal(b.status, 'Cancelled');
    assert.equal(b.cancelledBy, 'admin');
    assert.equal(Boolean(b.ownerCancelled), false);
    assert.equal(b.cancelReason, body.cancelReason);
    assert.equal(b.refund.status, 'Pending');
    assert.equal(b.refund.ownerInitiated, undefined);
    assert.equal(b.refund.isSameDay, false);
    assert.equal(b.refund.refundableAmount, 1000);
    assert.equal(b.refund.dispatchDeduction, 0);
  });

  test(`${label}, on and after the booked date: the transportation fee is entered at refund review`, async () => {
    for (const makeDate of [DATES.on, DATES.after]) {
      harness.reset({ users, services: [cleaning] });
      const b = paid(makeDate());
      assert.equal((await cancel(body)).status, 200);
      assert.equal(b.refund.isSameDay, true);
      assert.equal(b.refund.refundableAmount, undefined, 'waits for the admin to enter the fee');
      assert.equal(b.refund.ownerInitiated, undefined);
    }
  });
}

test('a plain cancel with no reason still works, as before', async () => {
  const b = paid(goodDate(7));
  assert.equal((await cancel({ status: 'Cancelled' })).status, 200);
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.cancelReason, undefined);
});

test('a reason that is too short or too long for a plain cancel is refused and nothing is cancelled', async () => {
  const b = paid(goodDate(7));
  for (const cancelReason of ['no', 'x'.repeat(201), 42, { $ne: 1 }]) {
    assert.equal((await cancel({ status: 'Cancelled', cancelReason })).status, 400, JSON.stringify(cancelReason));
  }
  assert.equal(b.status, 'Approved');
  assert.equal(b.refund.status, 'None');
});

test('the reason is only stored when the booking is being cancelled', async () => {
  const b = paid(goodDate(7));
  assert.equal((await cancel({ technicianInstructions: 'Bring a ladder', cancelReason: 'Customer request' })).status, 200);
  assert.equal(b.status, 'Approved');
  assert.equal(b.cancelReason, undefined);
});

// ---- the audit entry and what the customer sees

test('the audit entry has the reason, for the owner-initiated cancel and for the others', async () => {
  for (const [body, ownerInitiated] of [[OWNER, true], [CUSTOMER_REQUEST, undefined], [OTHER, undefined]]) {
    harness.reset({ users, services: [cleaning] });
    paid(goodDate(7));
    assert.equal((await cancel(body)).status, 200);
    const audit = state.audits.find((a) => a.action === 'booking.cancel');
    assert.equal(audit.actor.id, 'ADM1');
    assert.equal(audit.meta.reason, body.cancelReason);
    assert.equal(audit.meta.ownerInitiated, ownerInitiated);
  }
});

test('the audit entry of a plain cancel with no reason has none', async () => {
  paid(goodDate(7));
  assert.equal((await cancel({ status: 'Cancelled' })).status, 200);
  const audit = state.audits.find((a) => a.action === 'booking.cancel');
  assert.equal('reason' in audit.meta, false);
});

test('the customer can read who cancelled and why, for each case', () => {
  const view = (over) => toCustomerView({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Cancelled', refund: { status: 'None' }, ...over });
  const owner = view({ cancelledBy: 'admin', ownerCancelled: true, cancelReason: 'We do not carry that brand' });
  assert.equal(owner.ownerCancelled, true);
  assert.equal(owner.cancelReason, 'We do not carry that brand');
  const other = view({ cancelledBy: 'admin', cancelReason: 'The customer moved away' });
  assert.equal(other.cancelledBy, 'admin');
  assert.equal(other.cancelReason, 'The customer moved away');
  assert.equal(other.ownerCancelled, undefined);
});
