// Run with: npm test (inside server/). E17-3: the owner's "Cannot supply this unit" (admin only, reason required, note optional, the customer is
// told, nothing is cancelled) and the owner-initiated cancellation (the whole verified down payment goes back with no transportation fee, on
// the booked date and after it, while a customer's own late cancellation keeps its fee rule). The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { addDays } = require('../utils/extensionDays');
const { toCustomerView } = require('../utils/customerView');
const { unitConfirmationProblem } = require('../utils/suppliedUnits');

const { state, call, addBooking, addCatalogUnit, goodDate } = harness;

const install = { _id: 'S-INST', name: 'Installation', serviceType: 'Installation', price: 5000, isActive: true };
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
  { _id: 'CUS2', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer Two' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' },
];

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users, services: [install, cleaning] }));

const asAdmin = { role: 'admin' };
const asStaff = { role: 'staff' };
const declineCall = (as = 'ADM1', body = { reason: 'We do not carry that brand' }, opts = asAdmin) => call('PATCH', '/CZ-1/cannot-supply', as, body, opts);

// a Pending installation where Cooling Zone is to supply the unit (a catalog unit that was chosen)
const suppliedBooking = (over = {}) => {
  const item = addCatalogUnit({ brand: 'Daikin' });
  return addBooking({
    bookingId: 'CZ-1', customer: 'CUS1', service: install, status: 'Pending', clientSuppliedUnit: false, date: goodDate(9), time: 'Morning', downPaymentPercent: 50,
    paymentStatus: 'partially_paid', balancePaymentStatus: 'None', refund: { status: 'None' },
    units: [{ type: 'Split Type', quantity: 1, hp: '1', brand: 'Daikin', brandModel: 'Daikin T100 (inverter)', supplied: { source: 'catalog', catalogId: String(item._id), brand: 'Daikin', model: 'T100', type: 'Split Type', hp: '1', inverter: true, price: 25000 } }],
    ...over,
  });
};

test('only an admin can say it: staff and customers get 403, and nothing changes', async () => {
  const b = suppliedBooking();
  assert.equal((await declineCall('CUS1', { reason: 'We do not carry that brand' }, {})).status, 403);
  assert.equal((await declineCall('STF1', { reason: 'We do not carry that brand' }, asStaff)).status, 403);
  assert.equal(b.unitDecline, undefined);
  assert.equal(state.notes.length, 0);
});

test('a reason is required (3 to 200 characters) and the note is optional and short', async () => {
  const b = suppliedBooking();
  for (const body of [{}, { reason: '' }, { reason: 'no' }, { reason: 'x'.repeat(201) }, { reason: 42 }, { reason: 'We do not carry that brand', note: 'n'.repeat(301) }]) {
    assert.equal((await declineCall('ADM1', body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(b.unitDecline, undefined);
  assert.equal((await declineCall('ADM1', { reason: 'We do not carry that brand' })).status, 200, 'no note is fine');
});

test('it is only for a Pending booking with a unit Cooling Zone is to supply', async () => {
  suppliedBooking({ status: 'Approved' });
  assert.equal((await declineCall()).status, 400);
  harness.reset({ users, services: [install, cleaning] });
  addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', units: [{ type: 'Split Type', quantity: 1 }], date: goodDate(9), time: 'Morning' });
  const none = await declineCall();
  assert.equal(none.status, 400);
  assert.match(none.body.message, /no unit that Cooling Zone is to supply/);
  harness.reset({ users, services: [install, cleaning] });
  suppliedBooking({ clientSuppliedUnit: true });
  assert.equal((await declineCall()).status, 400, "a customer's own unit is not ours to decline");
});

test('the customer is told in the app with the reason and the note; the booking is not cancelled; the admin action is audited', async () => {
  const b = suppliedBooking();
  const res = await declineCall('ADM1', { reason: 'We do not carry that brand', note: 'We do have Carrier and LG 1 HP splits.' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.status, 'Pending', 'nothing is cancelled automatically');
  assert.equal(b.unitDecline.reason, 'We do not carry that brand');
  assert.equal(b.unitDecline.note, 'We do have Carrier and LG 1 HP splits.');
  const note = state.notes.find((n) => n.type === 'unit_request_declined');
  assert.equal(note.user, 'CUS1');
  assert.match(note.message, /we do not have the unit you chose/);
  assert.match(note.message, /We do not carry that brand/);
  assert.match(note.message, /Carrier and LG/);
  const audit = state.audits.find((a) => a.action === 'booking.unit_decline');
  assert.equal(audit.actor.id, 'ADM1');
  assert.equal(audit.entityId, 'CZ-1');
  assert.equal(audit.meta.reason, 'We do not carry that brand');
  assert.equal(audit.meta.note, 'We do have Carrier and LG 1 HP splits.');
});

test('the customer sees the message on the booking (reason and note, never who said it)', async () => {
  const b = suppliedBooking();
  await declineCall('ADM1', { reason: 'We do not carry that brand', note: 'We have Carrier.' });
  const view = toCustomerView({ ...b, service: install });
  assert.deepEqual(Object.keys(view.unitDecline).sort(), ['declinedAt', 'note', 'reason']);
  assert.equal(JSON.stringify(view).includes('ADM1'), false);
  const mine = await call('GET', '/CZ-1', 'CUS1');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.unitDecline.reason, 'We do not carry that brand');
});

test('the booking cannot be approved while the notice stands; withdrawing it clears that; an open request is declined with it', async () => {
  const b = suppliedBooking();
  await declineCall();
  const blocked = await call('PATCH', '/CZ-1/admin-update', 'ADM1', { status: 'Approved' }, asAdmin);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /cannot be supplied/);
  const withdrawn = await call('DELETE', '/CZ-1/cannot-supply', 'ADM1', undefined, asAdmin);
  assert.equal(withdrawn.status, 200);
  assert.equal(b.unitDecline, undefined);

  harness.reset({ users, services: [install, cleaning] });
  const request = addBooking({
    bookingId: 'CZ-1', customer: 'CUS1', service: install, status: 'Pending', clientSuppliedUnit: false, date: goodDate(9), time: 'Morning',
    units: [{ type: 'Split Type', quantity: 1, hp: '1', brand: 'Gree', supplied: { source: 'requested', status: 'Pending', request: { brand: 'Gree', type: 'Split Type', hp: '1', notes: '' } } }],
  });
  await declineCall();
  assert.equal(request.units[0].supplied.status, 'Declined');
  assert.match(unitConfirmationProblem(request.units).message, /declined/);
});

test('the customer can still cancel it (their own rules), and an admin can too', async () => {
  const b = suppliedBooking();
  await declineCall();
  const cancelled = await call('PATCH', '/CZ-1/cancel', 'CUS1', {});
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.cancelledBy, 'customer');
  assert.equal(Boolean(b.ownerCancelled), false, 'a customer cancelling is never owner-initiated');
});

// ---- owner-initiated cancellation and its refund
const paid = (date, over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 2 }], date, time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000, balancePaymentStatus: 'None', refund: { status: 'None' }, ...over,
});
const ownerCancel = (body = { status: 'Cancelled', ownerInitiated: true, cancelReason: 'We cannot supply the unit you chose' }) => call('PATCH', '/CZ-1/admin-update', 'ADM1', body, asAdmin);

test('owner-initiated: a reason is required, and without it nothing is cancelled', async () => {
  const b = paid(goodDate(7));
  for (const cancelReason of [undefined, '', 'no', 'x'.repeat(201)]) {
    const res = await ownerCancel({ status: 'Cancelled', ownerInitiated: true, cancelReason });
    assert.equal(res.status, 400, String(cancelReason));
  }
  assert.equal(b.status, 'Approved');
});

test('owner-initiated, before the booked date: the whole verified down payment, no fee, with the reason on the refund', async () => {
  const b = paid(goodDate(7));
  assert.equal((await ownerCancel()).status, 200);
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.ownerCancelled, true);
  assert.equal(b.cancelReason, 'We cannot supply the unit you chose');
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.refund.dispatchDeduction, 0);
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.refund.ownerInitiated, true);
  assert.equal(b.refund.reason, 'We cannot supply the unit you chose');
});

test('owner-initiated, on the booked date and after it: still the whole down payment and no fee', async () => {
  for (const date of [manilaTodayKey(), addDays(manilaTodayKey(), -3)]) {
    harness.reset({ users, services: [install, cleaning] });
    const b = paid(date);
    assert.equal((await ownerCancel()).status, 200, date);
    assert.equal(b.refund.isSameDay, false, `no late fee on ${date}`);
    assert.equal(b.refund.dispatchDeduction, 0);
    assert.equal(b.refund.refundableAmount, 1000);
  }
});

test("a customer's own cancellation on the booked date keeps its transportation fee rule", async () => {
  const b = paid(manilaTodayKey());
  assert.equal((await call('PATCH', '/CZ-1/cancel', 'CUS1', {})).status, 200);
  assert.equal(b.refund.isSameDay, true);
  assert.equal(b.refund.refundableAmount, undefined, 'waits for the admin to enter the fee');
  assert.equal(b.refund.ownerInitiated, undefined);
});

test('an admin cancelling for another reason (not owner-initiated) keeps the late fee rule', async () => {
  const b = paid(manilaTodayKey());
  assert.equal((await call('PATCH', '/CZ-1/admin-update', 'ADM1', { status: 'Cancelled' }, asAdmin)).status, 200);
  assert.equal(Boolean(b.ownerCancelled), false);
  assert.equal(b.refund.isSameDay, true);
});

test('owner-initiated with the proof still waiting: the refund request is open at the full amount, ready once the proof is verified', async () => {
  // the date is in the future for the proof check (the date does not matter to an owner-initiated refund)
  const b = paid(manilaTodayKey(), { paymentStatus: 'to_verify', proofFile: '/uploads/proofs/a.png', downPaymentPaidAmount: undefined });
  assert.equal((await ownerCancel()).status, 200);
  assert.equal(b.refund.status, 'Pending', 'asked for at once, though the proof is not verified yet');
  assert.equal(b.refund.paymentUnverified, true);
  assert.equal(b.paymentCheckAfterCancel, true);
  assert.equal((await call('PATCH', '/CZ-1/admin-update', 'ADM1', { paymentStatus: 'partially_paid' }, asAdmin)).status, 200);
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.paymentUnverified, false);
  assert.equal(b.refund.isSameDay, false);
  assert.equal(b.refund.refundableAmount, 1000);
});

test('the customer is told it was the owner, the reason, and that the whole down payment comes back; the cancellation is audited with the reason', async () => {
  paid(goodDate(7));
  await ownerCancel();
  const note = state.notes.find((n) => n.type === 'booking_cancelled' && n.user === 'CUS1');
  assert.match(note.message, /cannot supply or serve it: We cannot supply the unit you chose/);
  assert.match(note.message, /whole down payment will be refunded, with no transportation fee/);
  const audit = state.audits.find((a) => a.action === 'booking.cancel');
  assert.equal(audit.actor.id, 'ADM1');
  assert.equal(audit.meta.ownerInitiated, true);
  assert.equal(audit.meta.reason, 'We cannot supply the unit you chose');
});

test('the refund the customer sees carries the owner-initiated flag and the reason', () => {
  const b = paid(goodDate(7));
  b.ownerCancelled = true;
  b.cancelReason = 'We cannot supply the unit you chose';
  b.refund = { status: 'Pending', ownerInitiated: true, reason: 'We cannot supply the unit you chose', downPaymentAmount: 1000, refundableAmount: 1000, isSameDay: false };
  const view = toCustomerView({ ...b, service: cleaning });
  assert.equal(view.ownerCancelled, true);
  assert.equal(view.cancelReason, 'We cannot supply the unit you chose');
  assert.equal(view.refund.ownerInitiated, true);
  assert.equal(view.refund.reason, 'We cannot supply the unit you chose');
});

test('a booking is not affected: another customer cannot read the notice', async () => {
  suppliedBooking();
  await declineCall();
  const other = await call('GET', '/CZ-1', 'CUS2');
  assert.notEqual(other.status, 200);
});
