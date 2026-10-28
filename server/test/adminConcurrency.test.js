// Run with: npm test (inside server/). Two admins acting on the same booking at the same moment: exactly one succeeds and the
// customer is told once. The booking model refuses a save when the booking changed since it was read (optimistic concurrency, a
// 409), and the harness here does the same, so two parallel calls cannot both go through. Covered: booking approve, admin
// cancel, discount approve and reject, refund processing, refund flag resolution, extension approve and deny, reschedule
// approve and deny. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const harness = require('./helpers/createBooking');
const { PNG_DATA_URL } = require('./helpers/signature');
const { addDays } = require('../utils/extensionDays');

const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const D = () => goodDate(10);
const admin = (method, route, body) => call(method, route, 'ADM1', body, { role: 'admin' });
const both = (make) => Promise.all([make(), make()]);
const forCustomer = (type) => state.notes.filter((n) => n.user === 'CUS1' && n.type === type).length;
const oneWinner = (results) => {
  const codes = results.map((r) => r.status).sort();
  assert.equal(codes.filter((c) => c === 200).length, 1, `exactly one success, got ${JSON.stringify(codes)}`);
  assert.ok(codes.filter((c) => c !== 200).every((c) => c === 409 || c === 400), JSON.stringify(codes));
};

test('the booking model asks for optimistic concurrency, and a version clash is answered as a 409', () => {
  assert.equal(Booking.schema.options.optimisticConcurrency, true);
  const { sendRouteError } = require('../utils/routeErrors');
  let sent;
  sendRouteError({ status(code) { sent = { code }; return this; }, json(body) { sent.body = body; return this; } }, Object.assign(new Error('x'), { name: 'VersionError' }));
  assert.equal(sent.code, 409);
  assert.match(sent.body.message, /just changed by someone else/);
});

test.describe('two admins at once', () => {
  test.before(() => harness.install());
  test.after(() => harness.close());
  test.beforeEach(() => {
    harness.reset({
      users: [
        { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer' },
        { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
        { _id: 'ADM2', role: 'admin', isActive: true, name: 'Admin Two' },
        { _id: 'T1', role: 'staff', isActive: true, name: 'Ana', position: 'Technician' },
        { _id: 'T2', role: 'staff', isActive: true, name: 'Ben', position: 'Technician' },
      ],
      services: [cleaning],
    });
    state.versioned = true;
  });
  const booking = (over = {}) => addBooking({
    bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', date: D(), time: 'Morning', units: [{ type: 'Split Type', quantity: 1 }],
    downPaymentPercent: 50, paymentStatus: 'partially_paid', balancePaymentStatus: 'None', technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }], ...over,
  });

  test('approving the same booking', async () => {
    booking();
    oneWinner(await both(() => admin('PATCH', '/CZ-1/admin-update', { status: 'Approved' })));
    assert.equal(forCustomer('booking_approved'), 1);
    assert.equal(state.notes.filter((n) => n.user === 'T1').length, 1, 'each technician is told once');
  });

  test('cancelling the same booking as an admin', async () => {
    booking();
    oneWinner(await both(() => admin('PATCH', '/CZ-1/admin-update', { status: 'Cancelled' })));
    assert.equal(forCustomer('booking_cancelled'), 1);
  });

  test('approving the same discount', async () => {
    booking({ discount: { type: 'Senior', status: 'Pending' } });
    state.settings = { ...harness.DEFAULT_SETTINGS };
    oneWinner(await both(() => admin('PATCH', '/CZ-1/discount/approve', {})));
    assert.equal(forCustomer('discount_approved'), 1);
  });

  test('rejecting the same discount', async () => {
    booking({ discount: { type: 'Senior', status: 'Pending' } });
    oneWinner(await both(() => admin('PATCH', '/CZ-1/discount/reject', { reason: 'The ID is blurry' })));
    assert.equal(forCustomer('discount_rejected'), 1);
  });

  test('resolving the same refund flag', async () => {
    booking({ status: 'Cancelled', refund: { status: 'Processed', customerFlag: { flagged: true, message: 'Not received', resolved: false } } });
    oneWinner(await both(() => admin('PATCH', '/CZ-1/refund/flag/resolve', {})));
    assert.equal(state.bookings[0].refund.customerFlag.resolved, true);
  });

  test('processing the same refund twice', async () => {
    booking({ status: 'Cancelled', paymentStatus: 'partially_paid', refund: { status: 'Pending', isSameDay: false, downPaymentAmount: 1000, refundableAmount: 1000 } });
    const token = jwt.sign({ id: 'ADM1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const send = async () => {
      const form = new FormData();
      form.append('proof', new Blob([Buffer.from(PNG_DATA_URL.split(',')[1], 'base64')], { type: 'image/png' }), 'refund.png');
      const res = await fetch(`${harness.base()}/api/bookings/CZ-1/refund`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    const results = await both(send);
    oneWinner(results);
    assert.equal(forCustomer('refund_processed'), 1);
    const file = state.bookings[0].refund.proofFile;
    if (file) fs.rmSync(path.join(__dirname, '..', file.replace('/uploads/', 'uploads/')), { force: true });
  });

  test('approving the same extension request', async () => {
    booking({ status: 'In Progress', date: addDays(D(), -1), extensionRequest: { status: 'Pending', reason: 'More time', requestedDate: D(), requestedTime: 'Morning', requestedBy: 'T1' } });
    oneWinner(await both(() => admin('PATCH', '/CZ-1/extension/approve', {})));
    assert.equal(forCustomer('extension_approved'), 1);
    assert.equal(state.bookings[0].extensionDays.length, 1, 'the extra day is recorded once');
  });

  test('denying the same extension request', async () => {
    booking({ status: 'In Progress', extensionRequest: { status: 'Pending', reason: 'More time', requestedDate: D(), requestedTime: 'Morning', requestedBy: 'T1' } });
    oneWinner(await both(() => admin('PATCH', '/CZ-1/extension/deny', {})));
    assert.equal(forCustomer('extension_denied'), 1);
  });

  test('approving the same reschedule request', async () => {
    booking({ status: 'Approved', rescheduleRequest: { status: 'Pending', requestedDate: goodDate(14), requestedTime: 'Afternoon' } });
    oneWinner(await both(() => admin('PATCH', '/CZ-1/reschedule/approve', {})));
    assert.equal(forCustomer('reschedule_approved'), 1);
  });

  test('denying the same reschedule request', async () => {
    booking({ status: 'Approved', rescheduleRequest: { status: 'Pending', requestedDate: goodDate(14), requestedTime: 'Afternoon' } });
    oneWinner(await both(() => admin('PATCH', '/CZ-1/reschedule/deny', {})));
    assert.equal(forCustomer('reschedule_denied'), 1);
  });
});
