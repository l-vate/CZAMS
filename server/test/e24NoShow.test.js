// Run with: npm test (inside server/). E24: the customer can report that the technicians did not come, only on the service day after the waiting
// grace; the admin decides (confirm, reschedule, reject) with a reason. A report never refunds anything by itself and creates no score for any
// technician. Fixed clocks only. The real functions and routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/createBooking');
const { noShowAvailability, readNote, readDecisionReason } = require('../utils/noShow');
const { collectItems } = require('../utils/needsAttention');
const { RATE_LIMITS } = require('../middleware/rateLimit');

const { state, call, addBooking } = harness;

// Morning starts 08:00 Manila (00:00 UTC), so the report opens at 09:00 Manila (01:00 UTC).
const DAY = '2026-11-11';
const BEFORE_GRACE = new Date('2026-11-11T00:30:00Z'); // 08:30 Manila
const AFTER_GRACE = new Date('2026-11-11T01:30:00Z'); // 09:30 Manila
const NEXT_DAY = new Date('2026-11-12T02:00:00Z');
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const make = (id, over = {}) => addBooking({
  bookingId: id, customer: 'CUS1', service: cleaning, status: 'In Progress', startedBySystem: true, units: [{ type: 'Split Type', quantity: 2 }], date: DAY, time: 'Morning',
  downPaymentPercent: 50, paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000, balancePaymentStatus: 'None', refund: { status: 'None' },
  assignments: [{ lead: 'TECH1', helper: 'TECH2' }], createdAt: '2026-11-01T02:00:00Z', ...over,
});
const notesFor = (user, type) => state.notes.filter((n) => n.user === user && n.type === type);
const report = (id = 'CZ-1', body = {}, as = 'CUS1', role = 'customer') => call('PATCH', `/${id}/no-show`, as, body, { role });
const decide = (body, id = 'CZ-1', as = 'ADM1', role = 'admin') => call('PATCH', `/${id}/no-show/decision`, as, body, { role });

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => {
  harness.reset({
    users: [
      { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer' },
      { _id: 'CUS2', role: 'customer', isActive: true, name: 'Other Customer' },
      { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin One' },
      { _id: 'TECH1', role: 'technician', isActive: true, name: 'Tech One' },
      { _id: 'TECH2', role: 'technician', isActive: true, name: 'Tech Two' },
    ],
    services: [cleaning],
  });
});

// ---- when the action shows

test('before the waiting grace passes there is a note with the time, after it the action is available', () => {
  const b = { status: 'Approved', date: DAY, time: 'Morning' };
  assert.deepEqual(noShowAvailability(b, BEFORE_GRACE), { canReport: false, reason: 'wait', waitUntil: '9:00 AM' });
  assert.deepEqual(noShowAvailability(b, AFTER_GRACE), { canReport: true, reason: null });
  assert.equal(noShowAvailability({ ...b, time: 'Afternoon' }, AFTER_GRACE).waitUntil, '2:00 PM');
  assert.equal(noShowAvailability({ ...b, time: 'Afternoon' }, new Date('2026-11-11T06:10:00Z')).canReport, true, '14:10 Manila');
});

test('the action is for an Approved or In Progress booking, on the service day, with no report and no service report yet', () => {
  const ok = { status: 'In Progress', date: DAY, time: 'Morning' };
  assert.equal(noShowAvailability(ok, AFTER_GRACE).canReport, true);
  assert.equal(noShowAvailability({ ...ok, status: 'Approved' }, AFTER_GRACE).canReport, true);
  assert.equal(noShowAvailability({ ...ok, status: 'Pending' }, AFTER_GRACE).reason, 'status');
  assert.equal(noShowAvailability({ ...ok, status: 'Completed' }, AFTER_GRACE).reason, 'status');
  assert.equal(noShowAvailability({ ...ok, status: 'Cancelled' }, AFTER_GRACE).reason, 'status');
  assert.equal(noShowAvailability({ ...ok, date: '2026-11-12' }, AFTER_GRACE).reason, 'date', 'tomorrow is the wrong day');
  assert.equal(noShowAvailability({ ...ok, date: '2026-11-10' }, AFTER_GRACE).reason, 'date', 'yesterday is the wrong day');
  assert.equal(noShowAvailability({ ...ok, noShow: { status: 'Reported' } }, AFTER_GRACE).reason, 'report');
  assert.equal(noShowAvailability({ ...ok, noShow: { status: 'None' } }, AFTER_GRACE).canReport, true);
  assert.equal(noShowAvailability({ ...ok, reportSubmitted: true }, AFTER_GRACE).reason, 'filed');
});

test('the extra days let the owner allow the following day', () => {
  const ok = { status: 'In Progress', date: DAY, time: 'Morning' };
  assert.equal(noShowAvailability(ok, NEXT_DAY).canReport, false);
  assert.equal(noShowAvailability(ok, NEXT_DAY, { extraDays: 1 }).canReport, true);
  assert.equal(noShowAvailability(ok, AFTER_GRACE, { graceMinutes: 180 }).canReport, false, 'the grace is a constant');
});

test('the customer view carries the same answer, from the server clock', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: BEFORE_GRACE });
  make('CZ-1');
  const res = await call('GET', '/CZ-1', 'CUS1');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.noShowAvailability, { canReport: false, reason: 'wait', waitUntil: '9:00 AM' });
});

test('note and reason limits', () => {
  assert.deepEqual(readNote(undefined), { note: '' });
  assert.equal(readNote('x'.repeat(300)).note.length, 300);
  assert.ok(readNote('x'.repeat(301)).problem);
  assert.ok(readDecisionReason('ab').problem);
  assert.equal(readDecisionReason(' Crew did not come ').reason, 'Crew did not come');
  assert.ok(readDecisionReason('x'.repeat(301)).problem);
});

// ---- the report

test('a report marks the booking, tells the technicians in the app and the admin by email kind, and changes nothing else', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  const res = await report('CZ-1', { note: 'Nobody came by noon' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.noShow.status, 'Reported');
  assert.equal(b.noShow.note, 'Nobody came by noon');
  assert.equal(b.noShow.reportedBy, 'CUS1');
  assert.ok(b.noShow.reportedAt);
  assert.equal(b.status, 'In Progress', 'the booking stays as it is until the owner decides');
  assert.equal(notesFor('TECH1', 'no_show_reported').length, 1);
  assert.equal(notesFor('TECH2', 'no_show_reported').length, 1);
  assert.equal(notesFor('ADM1', 'no_show_reported').length, 1);
  assert.equal(res.body.noShow.status, 'Reported');
  assert.equal(state.audits.filter((a) => a.action === 'booking.no_show_report').length, 1);
});

test('a report never refunds anything by itself', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  await report();
  assert.equal(b.refund.status, 'None');
  assert.equal(b.status, 'In Progress');
  assert.equal(b.paymentStatus, 'partially_paid');
});

test('before the grace, on the wrong day or after the service report, the server refuses with the reason', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: BEFORE_GRACE });
  const b = make('CZ-1');
  const early = await report();
  assert.equal(early.status, 400);
  assert.equal(early.body.message, 'You can report a no show from 9:00 AM on the service day.');
  assert.equal(b.noShow, undefined);
  make('CZ-2', { date: '2026-11-12' });
  assert.equal((await report('CZ-2')).status, 400);
  make('CZ-3', { reportSubmitted: true });
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  assert.match((await report('CZ-3')).body.message, /service report was already filed/);
  make('CZ-4', { status: 'Completed' });
  assert.equal((await report('CZ-4')).status, 400);
});

test('one report per booking', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  make('CZ-1');
  assert.equal((await report()).status, 200);
  const again = await report();
  assert.equal(again.status, 409);
  assert.match(again.body.message, /already reported/);
  assert.equal(notesFor('ADM1', 'no_show_reported').length, 1, 'the admin is not told twice');
});

test('the note is limited to 300 characters', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  const res = await report('CZ-1', { note: 'x'.repeat(301) });
  assert.equal(res.status, 400);
  assert.equal(b.noShow, undefined);
});

test('the report route is rate limited with the existing setup', () => {
  assert.equal(RATE_LIMITS.noShow.max, 5);
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'bookingRoutes.js'), 'utf8');
  assert.match(src, /router\.patch\('\/:bookingId\/no-show', auth, allowRoles\(ROLE\.CUSTOMER\), noShowLimiter/);
});

test('privacy: a customer cannot report another customer\'s booking, and staff and admins cannot report one', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  assert.equal((await report('CZ-1', {}, 'CUS2')).status, 404);
  assert.equal((await report('CZ-1', {}, 'TECH1', 'technician')).status, 403);
  assert.equal((await report('CZ-1', {}, 'ADM1', 'admin')).status, 403);
  assert.equal(b.noShow, undefined);
});

test('privacy: only the admin can decide a report', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  await report();
  const body = { action: 'reject', reason: 'The crew was there' };
  assert.equal((await decide(body, 'CZ-1', 'CUS1', 'customer')).status, 403);
  assert.equal((await decide(body, 'CZ-1', 'TECH1', 'technician')).status, 403);
  assert.equal(b.noShow.status, 'Reported');
});

test('a technician sees that a report exists (read only), never the note, and no rating or score is created', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const { toTechnicianView } = require('../utils/technicianView');
  const b = make('CZ-1');
  await report('CZ-1', { note: 'private words' });
  const view = toTechnicianView(JSON.parse(JSON.stringify(b)));
  assert.equal(view.noShow.status, 'Reported');
  assert.equal(JSON.stringify(view).includes('private words'), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'utils', 'noShow.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'routes', 'bookingRoutes.js'), 'utf8').split("router.patch('/:bookingId/no-show'")[1];
  const code = src.split('// Admin: reject a refund request')[0].split(/\r?\n/).filter((line) => !line.trim().startsWith('//')).join(' ');
  assert.equal(/rating|score|performance/i.test(code), false);
});

test('the admin Needs action list gets "Technician no show reported" with urgency Today', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  make('CZ-1');
  await report();
  const items = collectItems({ bookings: JSON.parse(JSON.stringify(state.bookings)), now: AFTER_GRACE }).filter((i) => i.kind === 'no_show');
  assert.equal(items.length, 1);
  assert.equal(items[0].urgency, 'today');
  assert.equal(items[0].label, 'Technician no show reported');
});

// ---- the admin decision

test('every decision needs a reason, and only an open report can be decided', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  make('CZ-1');
  assert.equal((await decide({ action: 'reject', reason: 'x' })).status, 400, 'no report yet and no reason');
  assert.equal((await decide({ action: 'reject', reason: 'The crew was there' })).status, 409, 'no open report');
  await report();
  assert.equal((await decide({ action: 'confirm' })).status, 400, 'a reason is required');
  assert.equal((await decide({ action: 'nonsense', reason: 'because' })).status, 400);
});

test('confirm cancels as the owner: full refund of the verified down payment, no fee, the reason stored, and the customer can rebook', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  await report();
  const res = await decide({ action: 'confirm', reason: 'The crew did not leave the shop' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.status, 'Cancelled');
  assert.equal(b.ownerCancelled, true);
  assert.equal(b.cancelReason, 'The crew did not leave the shop');
  assert.equal(b.cancelledBy, 'admin');
  assert.equal(b.refund.status, 'Pending');
  assert.equal(b.refund.ownerInitiated, true);
  assert.equal(b.refund.isSameDay, false, 'no transportation fee, even on the booked date');
  assert.equal(b.refund.dispatchDeduction, 0);
  assert.equal(b.refund.refundableAmount, 1000);
  assert.equal(b.noShow.status, 'Confirmed');
  assert.equal(b.noShow.decisionReason, 'The crew did not leave the shop');
  const told = notesFor('CUS1', 'no_show_confirmed');
  assert.equal(told.length, 1);
  assert.match(told[0].message, /Your whole down payment will be refunded, with no transportation fee\. You are welcome to book another date\./);
  assert.equal(notesFor('ADM1', 'refund_requested').length, 1);
  assert.equal(state.audits.filter((a) => a.action === 'booking.no_show_decision').length, 1);
});

test('confirm with a proof still waiting opens the refund marked payment not verified', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1', { paymentStatus: 'to_verify', downPaymentPaidAmount: undefined });
  await report();
  assert.equal((await decide({ action: 'confirm', reason: 'Crew did not come' })).status, 200);
  assert.equal(b.refund.paymentUnverified, true);
  assert.equal(b.refund.isSameDay, false);
});

test('reschedule at no charge moves the booking to the new date, keeps the payments, and tells the customer', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  await report();
  const res = await decide({ action: 'reschedule', reason: 'Agreed a new day by phone', date: '2026-11-17', time: 'Afternoon' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.date, '2026-11-17');
  assert.equal(b.time, 'Afternoon');
  assert.equal(b.status, 'Approved', 'scheduled again, started by the job on its new day');
  assert.equal(b.startedBySystem, false);
  assert.equal(b.paymentStatus, 'partially_paid');
  assert.equal(b.downPaymentPaidAmount, 1000);
  assert.equal(b.refund.status, 'None');
  assert.equal(b.noShow.status, 'Rescheduled');
  assert.equal(notesFor('CUS1', 'disruption_rescheduled').length, 1);
});

test('reschedule needs a real new date and a time block, not in the past', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  await report();
  const base = { action: 'reschedule', reason: 'New day agreed' };
  assert.equal((await decide({ ...base })).status, 400);
  assert.equal((await decide({ ...base, date: '2026-11-09', time: 'Morning' })).status, 400, 'past');
  assert.equal((await decide({ ...base, date: '2026-11-17', time: 'Night' })).status, 400);
  assert.equal(b.noShow.status, 'Reported', 'nothing changed');
});

test('reject keeps the booking going and tells the customer why', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  await report();
  const res = await decide({ action: 'reject', reason: 'The crew checked in at the address at 8:15' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(b.status, 'In Progress');
  assert.equal(b.refund.status, 'None', 'a report never refunds by itself');
  assert.equal(b.noShow.status, 'Rejected');
  const told = notesFor('CUS1', 'no_show_rejected');
  assert.equal(told.length, 1);
  assert.match(told[0].message, /did not accept it: The crew checked in at the address at 8:15\. Your booking continues\./);
});

test('a decided report cannot be decided again, and cannot be reported again', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  make('CZ-1');
  await report();
  await decide({ action: 'reject', reason: 'The crew was there' });
  assert.equal((await decide({ action: 'confirm', reason: 'Changed my mind' })).status, 409);
  assert.equal((await report()).status, 409);
});

test('while a report waits, the customer cannot cancel online (no fee dodge or double handling)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  const b = make('CZ-1');
  await report();
  const res = await call('PATCH', '/CZ-1/cancel', 'CUS1');
  assert.equal(res.status, 400);
  assert.match(res.body.message, /no show report is being reviewed/);
  assert.equal(b.status, 'In Progress');
});

test('the customer sees the report and the decision with its reason, but not who decided', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: AFTER_GRACE });
  make('CZ-1');
  await report('CZ-1', { note: 'Nobody came' });
  await decide({ action: 'reject', reason: 'The crew was there' });
  const res = await call('GET', '/CZ-1', 'CUS1');
  assert.equal(res.body.noShow.status, 'Rejected');
  assert.equal(res.body.noShow.note, 'Nobody came');
  assert.equal(res.body.noShow.decisionReason, 'The crew was there');
  assert.equal(res.body.noShow.decidedBy, undefined);
  assert.equal(res.body.noShow.reportedBy, undefined);
});
