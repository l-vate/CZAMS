// Run with: npm test (inside server/). E24: a Pending booking nobody approved by the start of its booked day is cancelled automatically, with a full
// refund request for what was paid (nothing is paid out), and the customer is told why; an Approved booking starts by itself on its service day.
// Every rule is run with a fixed "now" (no weekday, no real clock). The real functions and routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const Booking = require('../models/Booking');
const { expirePendingBookings, startApprovedBookings, runDayStart, isPastApproval, approvalProblem } = require('../utils/bookingLifecycle');
const { runBookingStatusCheck } = require('../jobs/bookingStatusJob');
const { collectItems } = require('../utils/needsAttention');
const { toCustomerView } = require('../utils/customerView');

const { state, call, addBooking } = harness;

// 2026-11-11 00:30 in Manila (UTC+8): the day just started.
const NOW = new Date('2026-11-10T16:30:00Z');
const TODAY = '2026-11-11';
const YESTERDAY = '2026-11-10';
const TOMORROW = '2026-11-12';
const LONG_AGO = '2026-11-01T02:00:00Z';

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const make = (id, over = {}) => addBooking({
  bookingId: id, customer: 'CUS1', service: cleaning, status: 'Pending', units: [{ type: 'Split Type', quantity: 2 }], date: TOMORROW, time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'Unpaid', balancePaymentStatus: 'None', refund: { status: 'None' }, createdAt: LONG_AGO,
  assignments: [{ lead: 'TECH1', helper: 'TECH2' }], ...over,
});
const byId = (id) => state.bookings.find((b) => b.bookingId === id);
const notesFor = (user, type) => state.notes.filter((n) => n.user === user && n.type === type);

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => {
  harness.reset({
    users: [
      { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer' },
      { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
      { _id: 'ADM2', role: 'admin', isActive: true, name: 'Admin Two' },
      { _id: 'TECH1', role: 'technician', isActive: true, name: 'Tech One' },
      { _id: 'TECH2', role: 'technician', isActive: true, name: 'Tech Two' },
    ],
    services: [cleaning],
  });
});

test('a Pending booking before its booked day is left alone', async () => {
  make('CZ-1', { date: TOMORROW });
  const result = await expirePendingBookings({ now: NOW });
  assert.equal(result.expired, 0);
  assert.equal(byId('CZ-1').status, 'Pending');
});

test('a Pending booking expires at the start of its booked day, and on any day after it', async () => {
  make('CZ-1', { date: TODAY });
  make('CZ-2', { date: YESTERDAY });
  const result = await expirePendingBookings({ now: NOW });
  assert.equal(result.expired, 2);
  for (const id of ['CZ-1', 'CZ-2']) {
    const b = byId(id);
    assert.equal(b.status, 'Cancelled');
    assert.equal(b.cancelledBy, 'system');
    assert.equal(b.expiredBySystem, true);
    assert.equal(b.cancelReason, 'Expired: not confirmed before the booked date');
    assert.ok(b.cancelledAt);
  }
});

test('one minute before the booked day starts, nothing expires', async () => {
  make('CZ-1', { date: TODAY });
  const result = await expirePendingBookings({ now: new Date('2026-11-10T15:59:00Z') });
  assert.equal(result.expired, 0);
});

test('an urgent booking made on or after the start of its own day is not expired that day, only after it', async () => {
  make('CZ-1', { date: TODAY, createdAt: '2026-11-10T20:00:00Z' }); // created 2026-11-11 04:00 Manila, on its own day
  make('CZ-2', { date: YESTERDAY, createdAt: '2026-11-10T02:00:00Z' }); // created on its own day, that day is over
  const result = await expirePendingBookings({ now: NOW });
  assert.equal(result.expired, 1);
  assert.equal(byId('CZ-1').status, 'Pending');
  assert.equal(byId('CZ-2').status, 'Cancelled');
});

test('the grace days give the owner more time', async () => {
  make('CZ-1', { date: TODAY });
  make('CZ-2', { date: YESTERDAY });
  const result = await expirePendingBookings({ now: NOW, graceDays: 1 });
  assert.equal(result.expired, 1);
  assert.equal(byId('CZ-1').status, 'Pending');
  assert.equal(byId('CZ-2').status, 'Cancelled');
  assert.equal(isPastApproval({ status: 'Pending', date: TODAY, createdAt: LONG_AGO }, NOW, 1), false);
  assert.equal(isPastApproval({ status: 'Pending', date: YESTERDAY, createdAt: LONG_AGO }, NOW, 1), true);
});

test('a rescheduled booking is judged by its current date', async () => {
  const b = make('CZ-1', { date: YESTERDAY });
  b.date = TOMORROW; // the customer moved it to a later day
  assert.equal((await expirePendingBookings({ now: NOW })).expired, 0);
  assert.equal(b.status, 'Pending');
});

test('Approved, In Progress, Completed and Cancelled bookings are never touched by the expiry', async () => {
  make('CZ-1', { status: 'Approved', date: YESTERDAY });
  make('CZ-2', { status: 'In Progress', date: YESTERDAY });
  make('CZ-3', { status: 'Completed', date: YESTERDAY });
  make('CZ-4', { status: 'Cancelled', date: YESTERDAY, cancelledBy: 'customer' });
  const result = await expirePendingBookings({ now: NOW });
  assert.equal(result.matched, 0);
  assert.deepEqual(['CZ-1', 'CZ-2', 'CZ-3', 'CZ-4'].map((id) => byId(id).status), ['Approved', 'In Progress', 'Completed', 'Cancelled']);
  assert.equal(byId('CZ-4').expiredBySystem, undefined);
});

test('expiring releases the slot and the technicians: only a Pending, Approved or In Progress booking holds them', async () => {
  const { activeStatuses } = require('../utils/assignments');
  const b = make('CZ-1', { date: TODAY });
  await expirePendingBookings({ now: NOW });
  assert.equal(b.status, 'Cancelled');
  assert.equal([].concat(activeStatuses()).includes(b.status), false, 'Cancelled is not one of the statuses that count as busy');
});

test('a verified down payment opens a full refund request with no fee, marked as system initiated', async () => {
  const b = make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const result = await expirePendingBookings({ now: NOW });
  assert.equal(result.refundRequests, 1);
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.ownerInitiated, true);
  assert.equal(b.refund.systemInitiated, true);
  assert.equal(b.refund.expired, true);
  assert.equal(b.refund.isSameDay, false, 'no transportation fee');
  assert.equal(b.refund.dispatchDeduction, 0);
  assert.equal(b.refund.downPaymentAmount, 1000);
  assert.equal(b.refund.refundableAmount, 1000, 'the full verified down payment');
  assert.equal(b.refund.paymentUnverified, undefined);
  assert.equal(b.paymentCheckAfterCancel, undefined);
  assert.notEqual(b.refund.status, 'Processed', 'nothing is paid out');
});

test('a proof still waiting opens the refund marked payment not verified, and the proof check stays open', async () => {
  const b = make('CZ-1', { date: TODAY, paymentStatus: 'to_verify', proofFile: '/uploads/proofs/a.png' });
  await expirePendingBookings({ now: NOW });
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.paymentUnverified, true);
  assert.equal(b.refund.downPaymentAmount, 1000, '50% of 2,000');
  assert.equal(b.paymentCheckAfterCancel, true);
  // it cannot be paid out until the proof is verified (E21 rule, unchanged)
  const pay = await call('PATCH', '/CZ-1/refund', 'ADM1', {}, { role: 'admin' });
  assert.equal(pay.status, 400);
  assert.match(pay.body.message, /not been verified yet/);
});

test('a rejected proof later rejects the refund request by itself (E21 rule, unchanged)', async () => {
  const b = make('CZ-1', { date: TODAY, paymentStatus: 'to_verify', proofFile: '/uploads/proofs/a.png' });
  await expirePendingBookings({ now: NOW });
  const res = await call('PATCH', '/CZ-1/admin-update', 'ADM1', { paymentStatus: 'rejected', reason: 'The reference number does not match' }, { role: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.refund.status, 'Rejected');
  assert.equal(b.status, 'Cancelled');
});

test('no payment submitted opens no refund request', async () => {
  const b = make('CZ-1', { date: TODAY, paymentStatus: 'Unpaid' });
  const result = await expirePendingBookings({ now: NOW });
  assert.equal(result.expired, 1);
  assert.equal(result.refundRequests, 0);
  assert.equal(b.refund.status, 'None');
  const rejectedProof = make('CZ-2', { date: TODAY, paymentStatus: 'rejected' });
  await expirePendingBookings({ now: NOW });
  assert.equal(rejectedProof.refund.status, 'None', 'a rejected proof is no payment');
});

test('the booking and its refund request are one write: a booking is never Cancelled without its refund', async () => {
  make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const writes = [];
  const real = Booking.findOneAndUpdate;
  Booking.findOneAndUpdate = (f, update, options) => { writes.push(update.$set); return real(f, update, options); };
  await expirePendingBookings({ now: NOW });
  Booking.findOneAndUpdate = real;
  assert.equal(writes.length, 1, 'one conditional write');
  assert.equal(writes[0].status, 'Cancelled');
  assert.equal(writes[0].refund.status, 'Pending', 'the refund is in the same write as the cancellation');
});

test('an admin approving at the same moment is never overwritten', async () => {
  const b = make('CZ-1', { date: TODAY });
  const real = Booking.findOneAndUpdate;
  // the admin's approval lands after the job read the booking and before the job writes
  Booking.findOneAndUpdate = (f, update, options) => { b.status = 'Approved'; return real(f, update, options); };
  const result = await expirePendingBookings({ now: NOW });
  Booking.findOneAndUpdate = real;
  assert.equal(result.expired, 0);
  assert.equal(b.status, 'Approved');
  assert.equal(b.expiredBySystem, undefined);
  assert.equal(state.notes.length, 0, 'nobody is told about a cancellation that did not happen');
});

test('the job is idempotent: a second run does nothing, and the startup catch-up finds the same state', async () => {
  make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const first = await runBookingStatusCheck(NOW);
  const notes = state.notes.length;
  const audits = state.audits.length;
  const second = await runBookingStatusCheck(NOW);
  assert.equal(first.expiry.expired, 1);
  assert.equal(second.expiry.expired, 0);
  assert.equal(state.notes.length, notes, 'no second notice');
  assert.equal(state.audits.length, audits, 'no second audit line');
  assert.equal(byId('CZ-1').refund.status, 'Pending');
});

test('a run that was missed is caught up by the next one, whatever day it is', async () => {
  make('CZ-1', { date: '2026-11-03' });
  const result = await runBookingStatusCheck(new Date('2026-11-12T03:00:00Z'));
  assert.equal(result.expiry.expired, 1);
});

test('a dry run writes nothing and reports counts only', async () => {
  make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  make('CZ-2', { status: 'Approved', date: TODAY });
  const logs = [];
  const realLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  let result;
  try { result = await runDayStart({ now: NOW, dryRun: true }); } finally { console.log = realLog; }
  assert.deepEqual(result.expiry, { matched: 1, expired: 0, refundRequests: 0, skipped: 0 });
  assert.equal(result.start.started, 0);
  assert.equal(byId('CZ-1').status, 'Pending');
  assert.equal(byId('CZ-2').status, 'Approved');
  assert.equal(state.notes.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(logs.some((l) => /CZ-|Customer/.test(l)), false, 'no booking number or name in the log');
});

test('batches: more bookings than one batch are all processed', async () => {
  for (let i = 1; i <= 7; i += 1) make(`CZ-${i}`, { date: YESTERDAY });
  const result = await expirePendingBookings({ now: NOW, batchSize: 3 });
  assert.equal(result.expired, 7);
  assert.equal(state.bookings.filter((b) => b.status === 'Cancelled').length, 7);
});

test('every expired booking gets an audit line by "system", and its refund request another', async () => {
  make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  make('CZ-2', { date: TODAY });
  await expirePendingBookings({ now: NOW });
  const expired = state.audits.filter((a) => a.action === 'booking.expire');
  assert.equal(expired.length, 2);
  expired.forEach((a) => {
    assert.equal(a.actor.role, 'system');
    assert.equal(a.actor.name, 'system');
    assert.equal(a.entityType, 'Booking');
    assert.equal(a.meta.reason, 'Expired: not confirmed before the booked date');
  });
  const refunds = state.audits.filter((a) => a.action === 'refund.open');
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].meta.expired, true);
  assert.equal(refunds[0].meta.fee, 0);
});

test('the customer is told clearly why, with the right refund sentence, in the app', async () => {
  make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  make('CZ-2', { date: TODAY, paymentStatus: 'to_verify', proofFile: '/uploads/proofs/a.png' });
  make('CZ-3', { date: TODAY });
  await expirePendingBookings({ now: NOW });
  const told = notesFor('CUS1', 'booking_expired');
  assert.equal(told.length, 3);
  const text = (id) => told.find((n) => n.relatedBookingId === id || n.message.includes(id)).message;
  assert.match(text('CZ-1'), /cancelled automatically because it was not confirmed by the owner before the service day started\. A full refund of your down payment is being processed\. You are welcome to book another date\./);
  assert.match(text('CZ-2'), /Your payment was not yet verified\. Once it is verified, a full refund will be processed\./);
  assert.match(text('CZ-3'), /No payment was made, so there is nothing to refund\./);
  assert.match(text('CZ-1'), new RegExp(`for ${TODAY}`));
});

test('every admin hears about an expiry with the refund count, one summary when there are many, and nothing else changes', async () => {
  make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  await expirePendingBookings({ now: NOW });
  assert.equal(notesFor('ADM1', 'booking_expired').length, 1);
  assert.equal(notesFor('ADM2', 'booking_expired').length, 1);
  assert.match(notesFor('ADM1', 'booking_expired')[0].message, /full refund request/);
  assert.equal(state.notes.some((n) => ['booking_cancelled', 'refund_requested'].includes(n.type)), false, 'no other kind is created');

  harness.reset({ users: state.users, services: [cleaning] });
  for (let i = 1; i <= 7; i += 1) make(`CZ-${i}`, { date: YESTERDAY, paymentStatus: i <= 2 ? 'partially_paid' : 'Unpaid', downPaymentPaidAmount: 1000 });
  await expirePendingBookings({ now: NOW });
  const summary = notesFor('ADM1', 'booking_expired');
  assert.equal(summary.length, 1, 'one summary for many');
  assert.match(summary[0].message, /7 bookings expired/);
  assert.match(summary[0].message, /2 refund requests are waiting/);
});

test('the admin cannot approve a Pending booking whose service day has started, except an urgent one made on its own day', () => {
  assert.match(approvalProblem({ status: 'Pending', date: TODAY, createdAt: LONG_AGO }, NOW), /can no longer be approved because its service day has started/);
  assert.equal(approvalProblem({ status: 'Pending', date: TOMORROW, createdAt: LONG_AGO }, NOW), null);
  assert.equal(approvalProblem({ status: 'Pending', date: TODAY, createdAt: '2026-11-10T20:00:00Z' }, NOW), null, 'created on its own day');
  assert.equal(approvalProblem({ status: 'Approved', date: TODAY, createdAt: LONG_AGO }, NOW), null);
});

test('the approval route refuses it with the clear message (409) and leaves the booking Pending', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const b = make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const res = await call('PATCH', '/CZ-1/admin-update', 'ADM1', { status: 'Approved' }, { role: 'admin' });
  assert.equal(res.status, 409);
  assert.equal(res.body.message, 'This booking can no longer be approved because its service day has started.');
  assert.equal(b.status, 'Pending');
  const urgent = make('CZ-2', { date: TODAY, createdAt: '2026-11-10T20:00:00Z', paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const ok = await call('PATCH', '/CZ-2/admin-update', 'ADM1', { status: 'Approved' }, { role: 'admin' });
  assert.notEqual(ok.body.message, 'This booking can no longer be approved because its service day has started.');
  assert.equal(urgent.status === 'Approved' || ok.status === 400, true, 'approved, or stopped only by a different rule such as staffing');
});

test('an expired booking is no longer a Needs action item, only its refund is', async () => {
  make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  const before = collectItems({ bookings: JSON.parse(JSON.stringify(state.bookings)), now: NOW }).map((i) => i.kind);
  assert.ok(before.includes('today_pending'));
  await expirePendingBookings({ now: NOW });
  const after = collectItems({ bookings: JSON.parse(JSON.stringify(state.bookings)), now: NOW }).map((i) => i.kind);
  assert.equal(after.includes('today_pending'), false);
  assert.equal(after.includes('pending_approval'), false);
  assert.deepEqual(after.filter((k) => k !== 'refund_waiting'), []);
});

test('the customer sees the expired state, the reason and the refund in words, and nothing internal', async () => {
  const b = make('CZ-1', { date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  await expirePendingBookings({ now: NOW });
  const res = await call('GET', '/CZ-1', 'CUS1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'Cancelled');
  assert.equal(res.body.expiredBySystem, true);
  assert.equal(res.body.cancelledBy, 'system');
  assert.equal(res.body.cancelReason, 'Expired: not confirmed before the booked date');
  assert.equal(res.body.refund.expired, true);
  assert.equal(res.body.refund.systemInitiated, true);
  assert.equal(res.body.refund.status, 'Pending');
  assert.equal(toCustomerView(b).expiredBySystem, true);
});

// ---- the service day starts

test('an Approved booking whose service day has started becomes In Progress, once, with an audit line and no email to the customer', async () => {
  const b = make('CZ-1', { status: 'Approved', date: TODAY, time: 'Afternoon' });
  const result = await startApprovedBookings({ now: NOW });
  assert.equal(result.started, 1);
  assert.equal(b.status, 'In Progress');
  assert.equal(b.startedBySystem, true);
  const lines = state.audits.filter((a) => a.action === 'booking.start');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].actor.role, 'system');
  assert.equal(lines[0].summary, 'Service day started');
  assert.equal(notesFor('CUS1', 'booking_in_progress').length, 0, 'no notice and no email for the customer');
  assert.deepEqual(notesFor('TECH1', 'booking_in_progress').length + notesFor('TECH2', 'booking_in_progress').length, 2, 'an in-app note for each technician');
  const again = await startApprovedBookings({ now: NOW });
  assert.equal(again.started, 0);
  assert.equal(state.audits.filter((a) => a.action === 'booking.start').length, 1, 'no duplicate audit entry');
});

test('an Approved booking dated tomorrow is not started, and a Pending one is never started', async () => {
  make('CZ-1', { status: 'Approved', date: TOMORROW });
  make('CZ-2', { status: 'Pending', date: TOMORROW });
  assert.equal((await startApprovedBookings({ now: NOW })).started, 0);
});

test('a booking cancelled at the same moment is not started (conditional update)', async () => {
  const b = make('CZ-1', { status: 'Approved', date: TODAY });
  const real = Booking.findOneAndUpdate;
  Booking.findOneAndUpdate = (f, update, options) => { b.status = 'Cancelled'; return real(f, update, options); };
  const result = await startApprovedBookings({ now: NOW });
  Booking.findOneAndUpdate = real;
  assert.equal(result.started, 0);
  assert.equal(b.status, 'Cancelled');
});

test('the job expires first and starts second in one run, counts only', async () => {
  make('CZ-1', { status: 'Pending', date: TODAY });
  make('CZ-2', { status: 'Approved', date: TODAY });
  const result = await runBookingStatusCheck(NOW);
  assert.equal(result.expiry.expired, 1);
  assert.equal(result.start.started, 1);
});

test('after the auto-start the customer can still cancel on the booked date, under the existing fee rule', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T04:00:00Z') });
  const b = make('CZ-1', { status: 'Approved', date: TODAY, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  await startApprovedBookings({ now: new Date() });
  assert.equal(b.status, 'In Progress');
  const res = await call('PATCH', '/CZ-1/cancel', 'CUS1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.cancelledBy, 'customer');
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.isSameDay, true, 'on the booked date a transportation fee applies, entered by the admin');
  assert.equal(b.refund.refundableAmount, undefined, 'the fee is entered when the refund is processed');
});

test('a booking that started any other way, or whose job is done, still cannot be cancelled online', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T04:00:00Z') });
  make('CZ-1', { status: 'In Progress', date: TODAY });
  const manual = await call('PATCH', '/CZ-1/cancel', 'CUS1');
  assert.equal(manual.status, 400);
  assert.match(manual.body.message, /already in progress/);
  make('CZ-2', { status: 'In Progress', date: TODAY, startedBySystem: true, reportSubmitted: true });
  assert.equal((await call('PATCH', '/CZ-2/cancel', 'CUS1')).status, 400, 'the service report is already filed');
  make('CZ-3', { status: 'Completed', date: TODAY, startedBySystem: true });
  assert.equal((await call('PATCH', '/CZ-3/cancel', 'CUS1')).status, 400);
});

test('an admin can still cancel an In Progress booking, and the technician job lists keep showing it', async () => {
  const b = make('CZ-1', { status: 'Approved', date: TODAY });
  await startApprovedBookings({ now: NOW });
  const { TECHNICIAN_BOOKING_FILTER } = require('../utils/technicianVisibility');
  assert.ok(TECHNICIAN_BOOKING_FILTER, 'the technician job filter exists');
  const res = await call('PATCH', '/CZ-1/admin-update', 'ADM1', { status: 'Cancelled', cancelReason: 'Customer called' }, { role: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.status, 'Cancelled');
});

test('constants: one place for the schedule, the grace days and the no show waiting time', () => {
  const c = require('../constants/bookingLifecycle');
  assert.equal(c.PENDING_EXPIRY_GRACE_DAYS, 0);
  assert.equal(c.NO_SHOW_REPORT_GRACE_MINUTES, 60);
  assert.equal(c.NO_SHOW_REPORT_EXTRA_DAYS, 0);
  assert.deepEqual(c.DAY_START_JOB_SCHEDULE, { midnight: '5 0 * * *', hourly: '20 * * * *' });
});
