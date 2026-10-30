// Run with: npm test (inside server/). E25: the Due states. An Installation with a unit Cooling Zone supplies waits for the owner to confirm the
// unit, and only then is the customer asked for the down payment (in the app and by email); every other booking owes it at once; the balance is
// due when the service is Completed. The admin's Approve always says why it is off, and the admin's "Record a payment" has limits and an undo.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { paymentDueOf, approvalPaymentBlock, unitAwaitingConfirmation } = require('../utils/paymentDue');
const { toCustomerView } = require('../utils/customerView');
const { withWarranty } = require('../utils/bookingView');
const { EMAIL_NOTIFICATION_TYPES } = require('../utils/emailDelivery');
const { collectItems } = require('../utils/needsAttention');

const { state, post, call, callPath, addCatalogUnit, goodDate } = harness;

const install = { _id: 'S-INST', name: 'Installation', serviceType: 'Installation', price: 5000, isActive: true };
const clean = { _id: 'S-CLN', name: 'Regular Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' },
];

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users, services: [install, clean] }));

const asAdmin = { role: 'admin' };
const bookInstall = (units, extra = {}) => post({ service: 'S-INST', date: goodDate(9), clientSuppliedUnit: false, units, ...extra }, 'CUS1');
const bookCleaning = () => post({ service: 'S-CLN', date: goodDate(9), units: [{ type: 'Split Type', quantity: 1, hp: '1' }] }, 'CUS1');
const catalogUnits = (item) => [{ type: item.type, quantity: 1, hp: item.hp, supplied: { catalogId: item._id } }];
const bid = () => state.bookings[0].bookingId;
const noteTypes = () => state.notes.filter((n) => n.user === 'CUS1').map((n) => n.type);
const mine = async () => (await call('GET', '/mine', 'CUS1')).body.find((b) => b.bookingId === bid());
// the admin's shape of a booking (the list route), with what is due and why Approve is off
const adminView = async () => (await call('GET', '', 'ADM1', undefined, asAdmin)).body.find((b) => b.bookingId === bid());
const adminUpdate = (body) => call('PATCH', `/${bid()}/admin-update`, 'ADM1', body, asAdmin);
const confirmUnit = (as = 'ADM1', opts = asAdmin) => callPath('PATCH', `/api/bookings/${bid()}/confirm-unit`, as, undefined, opts);

test('a catalog unit on an Installation: nothing is due until the owner confirms it, and the server refuses a payment', async () => {
  await bookInstall(catalogUnits(addCatalogUnit({ price: 25000 })));
  const seen = await mine();
  assert.equal(seen.paymentDue.kind, null);
  assert.equal(seen.paymentDue.waitingForUnit, true);
  assert.equal(seen.awaitingUnitConfirmation, true);
  const pay = await call('PATCH', `/${bid()}/pay`, 'CUS1');
  assert.equal(pay.status, 400);
  assert.match(pay.body.message, /confirm the unit first/);
});

test('Approve says why: confirm the unit first, with no silent failure', async () => {
  await bookInstall(catalogUnits(addCatalogUnit({ price: 25000 })));
  const refused = await adminUpdate({ status: 'Approved' });
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /Confirm the unit first/);
  const view = await adminView();
  assert.equal(view.approvalBlock.code, 'unit');
  assert.equal(view.awaitingUnitConfirmation, true);
});

test('confirming the unit makes the down payment due and tells the customer in the app and by email', async () => {
  await bookInstall(catalogUnits(addCatalogUnit({ price: 25000 })));
  const confirmed = await confirmUnit();
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.ok(state.bookings[0].unitConfirmedAt);
  assert.ok(state.audits.some((a) => a.action === 'booking.unit_confirm'));
  assert.deepEqual(noteTypes().filter((t) => t === 'payment_due'), ['payment_due']);
  const note = state.notes.find((n) => n.type === 'payment_due');
  assert.match(note.message, /your unit is confirmed/);
  assert.match(note.message, /down payment of ₱2,500/, '50% of the 5000 service; the unit price is not in it');
  assert.ok(EMAIL_NOTIFICATION_TYPES.has('payment_due'), 'payment_due is emailed');
  const seen = await mine();
  assert.equal(seen.paymentDue.kind, 'down');
  assert.equal(seen.paymentDue.amount, 2500);
  assert.equal((await confirmUnit()).status, 409, 'confirming twice is refused');
});

test('Approve then waits for the customer, then for the verification, then works', async () => {
  await bookInstall(catalogUnits(addCatalogUnit({ price: 25000 })));
  await confirmUnit();
  let refused = await adminUpdate({ status: 'Approved' });
  assert.match(refused.body.message, /Waiting for the customer's down payment/);
  state.bookings[0].paymentStatus = 'to_verify';
  state.bookings[0].proofFile = '/uploads/proofs/p.png';
  refused = await adminUpdate({ status: 'Approved' });
  assert.match(refused.body.message, /Verify it first/);
  const verified = await adminUpdate({ paymentStatus: 'partially_paid' });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const approved = await adminUpdate({ status: 'Approved' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
});

test('only an admin can confirm a unit, and only on a booking that has one to confirm', async () => {
  await bookInstall(catalogUnits(addCatalogUnit({ price: 25000 })));
  assert.equal((await confirmUnit('CUS1', { role: 'customer' })).status, 403);
  harness.reset({ users, services: [install, clean] });
  await bookCleaning();
  assert.equal((await confirmUnit()).status, 400);
});

test("the customer's own unit: the down payment is due at once, nothing waits for a confirmation", async () => {
  const r = await post({
    service: 'S-INST', date: goodDate(9), clientSuppliedUnit: true, unitWaiverName: 'Customer One', unitWaiverAcknowledged: true,
    units: [{ type: 'Split Type', quantity: 1, hp: '1', brandModel: 'Own brand' }],
  }, 'CUS1');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const seen = await mine();
  assert.equal(seen.paymentDue.kind, 'down');
  assert.equal(seen.awaitingUnitConfirmation, false);
});

test('a booking that is not an Installation owes its down payment at once', async () => {
  await bookCleaning();
  const seen = await mine();
  assert.equal(seen.paymentDue.kind, 'down');
  assert.equal(seen.paymentDue.amount, 400);
  assert.equal((await adminView()).approvalBlock.code, 'waiting');
});

test('a "Not listed" request becomes due when the owner settles the last one', async () => {
  await bookInstall([{ type: 'Split Type', quantity: 1, hp: '1', supplied: { notListed: true, brand: 'Other', notes: 'white' } }]);
  assert.equal((await mine()).paymentDue.waitingForUnit, true);
  const item = addCatalogUnit({ price: 31000 });
  const resolved = await call('PATCH', `/${bid()}/units/0/resolve`, 'ADM1', { catalogId: item._id }, asAdmin);
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.ok(state.bookings[0].unitConfirmedAt);
  assert.ok(noteTypes().includes('payment_due'));
  assert.equal((await mine()).paymentDue.kind, 'down');
});

test('the pure rules: zero down payment owes nothing, the balance is due on Completed, nothing is due on a cancelled booking', () => {
  const svc = { serviceType: 'Cleaning', price: 1000 };
  const base = { service: svc, units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 50, paymentStatus: 'Unpaid', balancePaymentStatus: 'None', status: 'Pending', pricingVersion: 2 };
  assert.equal(paymentDueOf({ ...base, downPaymentPercent: 0 }).kind, null);
  assert.equal(paymentDueOf({ ...base, downPaymentPercent: 0, status: 'Completed' }).kind, 'balance');
  assert.equal(paymentDueOf({ ...base, paymentStatus: 'to_verify' }).kind, null, 'a proof is waiting: nothing more is due');
  assert.equal(paymentDueOf({ ...base, paymentStatus: 'rejected' }).kind, 'down');
  const completed = { ...base, paymentStatus: 'partially_paid', status: 'Completed' };
  assert.deepEqual(paymentDueOf(completed), { kind: 'balance', amount: 500, waitingForUnit: false });
  assert.equal(paymentDueOf({ ...completed, balancePaymentStatus: 'to_verify' }).kind, null);
  assert.equal(paymentDueOf({ ...completed, balancePaymentStatus: 'rejected' }).kind, 'balance');
  assert.equal(paymentDueOf({ ...base, status: 'Cancelled' }).kind, null);
  assert.equal(paymentDueOf({ ...base, isBackJob: true }).kind, null);
  assert.equal(approvalPaymentBlock({ ...base, downPaymentPercent: 0 }), null, 'no down payment due: nothing blocks');
  const supplied = { ...base, service: { serviceType: 'Installation' }, units: [{ supplied: { source: 'catalog' } }] };
  assert.equal(unitAwaitingConfirmation(supplied), true);
  assert.equal(unitAwaitingConfirmation({ ...supplied, status: 'Approved' }), false);
  assert.equal(unitAwaitingConfirmation({ ...supplied, unitConfirmedAt: new Date() }), false);
});

test('the customer view and the admin view carry what is due; the customer never gets the admin sentence', () => {
  const b = {
    toObject() { return { ...this }; }, service: { serviceType: 'Cleaning', price: 1000 }, units: [{ type: 'Split Type', quantity: 1 }],
    downPaymentPercent: 50, paymentStatus: 'Unpaid', status: 'Pending', pricingVersion: 2, date: '2030-01-01',
  };
  assert.equal(toCustomerView(b).paymentDue.kind, 'down');
  assert.equal(toCustomerView(b).approvalBlock, undefined);
  assert.equal(withWarranty(b).approvalBlock.code, 'waiting');
});

test('a rejected proof gives the customer the reason', () => {
  const b = {
    toObject() { return { ...this }; }, service: { serviceType: 'Cleaning', price: 1000 }, units: [], paymentStatus: 'rejected',
    paymentEvents: [{ track: 'down', status: 'rejected', reason: 'The reference did not match' }],
  };
  const view = toCustomerView(b);
  assert.equal(view.downPaymentRejectionReason, 'The reference did not match');
  assert.equal(view.paymentEvents, undefined, 'the payment log itself stays hidden');
});

// ---- admin: record a payment and undo it
test('Record a payment: the amount is limited to what is left, and the balance has to be the whole balance', async () => {
  await bookCleaning();
  const rec = (body) => call('PATCH', `/${bid()}/record-payment`, 'ADM1', { method: 'Cash', ...body }, asAdmin);
  const tooMuch = await rec({ track: 'down', amount: 5000 });
  assert.equal(tooMuch.status, 400);
  assert.match(tooMuch.body.message, /more than the booking comes to/);
  assert.equal((await rec({ track: 'down', amount: 0 })).status, 400);
  assert.equal(state.bookings[0].paymentStatus, 'Unpaid', 'nothing was recorded');
  assert.equal((await rec({ track: 'down', amount: 400 })).status, 200);
  assert.equal(state.bookings[0].paymentStatus, 'partially_paid');
  state.bookings[0].balancePaymentStatus = 'None'; // the stand-in database has no schema defaults
  const part = await rec({ track: 'balance', amount: 100 });
  assert.equal(part.status, 400);
  assert.match(part.body.message, /Record the whole balance/);
  assert.equal((await rec({ track: 'balance', amount: 9999 })).status, 400);
  assert.equal((await rec({ track: 'balance', amount: 400 })).status, 200);
  assert.equal(state.bookings[0].paymentStatus, 'fully_paid');
});

test('a recorded payment can be reversed with a reason, and the reversal is on the payment log', async () => {
  await bookCleaning();
  await call('PATCH', `/${bid()}/record-payment`, 'ADM1', { method: 'Cash', track: 'down', amount: 400 }, asAdmin);
  assert.equal((await adminUpdate({ reverse: 'down' })).status, 400, 'a reason is required');
  const undone = await adminUpdate({ reverse: 'down', reason: 'Entered on the wrong booking' });
  assert.equal(undone.status, 200, JSON.stringify(undone.body));
  assert.equal(state.bookings[0].paymentStatus, 'Unpaid');
  assert.equal(state.bookings[0].downPaymentPaidAmount, undefined);
});

test('a payment a refund depends on cannot be reversed', async () => {
  await bookCleaning();
  await call('PATCH', `/${bid()}/record-payment`, 'ADM1', { method: 'Cash', track: 'down', amount: 400 }, asAdmin);
  state.bookings[0].refund = { status: 'Pending' };
  const blocked = await adminUpdate({ reverse: 'down', reason: 'Wrong booking' });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.message, /refund/);
});

// ---- admin: Needs attention
test("a Pending booking that waits for the customer's payment is listed as such and is never urgent", () => {
  const svc = { _id: 'S1', serviceType: 'Cleaning', price: 1000 };
  const b = {
    bookingId: 'CZ-1', customer: 'C1', service: 'S1', status: 'Pending', date: '2026-11-02', units: [{ type: 'Split Type', quantity: 1 }],
    downPaymentPercent: 50, paymentStatus: 'Unpaid', createdAt: new Date('2026-10-30T01:00:00Z'), pricingVersion: 2,
  };
  const now = new Date('2026-11-02T02:00:00Z');
  const items = collectItems({ bookings: [b], servicesById: new Map([['S1', svc]]), now });
  assert.deepEqual(items.map((i) => i.kind), ['waiting_payment']);
  assert.equal(items[0].urgency, 'waiting');
  // once the proof is sent it is the admin's move again
  const sent = collectItems({ bookings: [{ ...b, paymentStatus: 'to_verify' }], servicesById: new Map([['S1', svc]]), now });
  assert.ok(sent.some((i) => i.kind === 'today_pending'));
});

test('an Installation unit that waits for the owner is a decision for the admin', () => {
  const svc = { _id: 'S2', serviceType: 'Installation', price: 5000 };
  const b = {
    bookingId: 'CZ-2', customer: 'C1', service: 'S2', status: 'Pending', date: '2026-12-20', units: [{ type: 'Split Type', quantity: 1, supplied: { source: 'catalog' } }],
    downPaymentPercent: 50, paymentStatus: 'Unpaid', createdAt: new Date('2026-10-30T01:00:00Z'), pricingVersion: 2,
  };
  const items = collectItems({ bookings: [b], servicesById: new Map([['S2', svc]]), now: new Date('2026-11-02T02:00:00Z') });
  assert.ok(items.some((i) => i.kind === 'unit_confirmation'));
  assert.ok(!items.some((i) => i.kind === 'waiting_payment'));
});
