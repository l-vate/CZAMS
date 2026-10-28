'use strict';
// Run with: npm test (inside server/). E20: the "Needs attention" panel of the admin dashboard. The rules (utils/needsAttention.js) are pure
// functions, tested here with a fixed "now" (a Monday, a Saturday and a Sunday are all used on purpose, so the result never depends on the day
// the tests run). The route (GET /api/admin/needs-attention) runs for real in a tiny Express app with the models replaced by stand-ins: admin
// only, at most 4 queries, and nothing is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const BackJob = require('../models/BackJob');
const Service = require('../models/Service');
const { authCache } = require('../utils/authCache');
const { buildGroups, withNames, collectItems, workingDaysBetween, compareItems } = require('../utils/needsAttention');
const { ITEMS_PER_GROUP, SOON_AFTER_WORKING_DAYS, GROUPS } = require('../constants/needsAttention');

// 2026-11-04 is a Wednesday (12:00 in Manila). Its neighbours: Sat 11-07, Sun 11-08, Mon 11-09.
const WED = new Date('2026-11-04T04:00:00Z');
const TODAY = '2026-11-04';
const TOMORROW = '2026-11-05';
const LATER = '2026-11-20';
const daysAgo = (n) => new Date(WED.getTime() - n * 86400000);

const pair = { _id: 'S-PAIR', name: 'Cleaning', serviceType: 'Cleaning' };
const solo = { _id: 'S-SOLO', name: 'Check-up', serviceType: 'Check-up' };
const servicesById = new Map([[pair._id, pair], [solo._id, solo]]);

let n = 0;
const booking = (over = {}) => {
  n += 1;
  return {
    bookingId: `CZ-2026-${1000 + n}`, customer: 'C1', service: pair._id, status: 'Pending', date: LATER, time: 'Morning', assignments: [],
    createdAt: daysAgo(0), updatedAt: daysAgo(0), paymentStatus: 'unpaid', balancePaymentStatus: 'None', units: [{ type: 'Split Type', quantity: 1 }],
    ...over,
  };
};
const kindsOf = (bookings, backJobs = [], now = WED) => collectItems({ bookings, backJobs, servicesById, now }).map((i) => `${i.kind}:${i.bookingId}`);
const has = (list, kind, b) => list.includes(`${kind}:${b.bookingId}`);

test('Today: a Pending booking dated today or tomorrow, an Approved one with too few technicians, and a payment proof not verified', () => {
  const pendingToday = booking({ date: TODAY });
  const pendingTomorrow = booking({ date: TOMORROW });
  const pendingLater = booking({ date: LATER });
  const unstaffed = booking({ status: 'Approved', date: TODAY, assignments: [{ lead: 'T1' }] });
  const staffed = booking({ status: 'Approved', date: TODAY, assignments: [{ lead: 'T1' }, { lead: 'T2' }] });
  const staffedOldPair = booking({ status: 'Approved', date: TODAY, assignments: [{ lead: 'T1', helper: 'T2' }] });
  const soloOk = booking({ status: 'Approved', date: TODAY, service: solo._id, assignments: [{ lead: 'T1' }] });
  const proof = booking({ status: 'Approved', date: TOMORROW, paymentStatus: 'to_verify', assignments: [{ lead: 'T1' }, { lead: 'T2' }] });
  const proofLater = booking({ status: 'Approved', date: LATER, paymentStatus: 'to_verify', assignments: [{ lead: 'T1' }, { lead: 'T2' }] });
  const list = kindsOf([pendingToday, pendingTomorrow, pendingLater, unstaffed, staffed, staffedOldPair, soloOk, proof, proofLater]);

  assert.ok(has(list, 'today_pending', pendingToday));
  assert.ok(has(list, 'today_pending', pendingTomorrow));
  assert.ok(!has(list, 'today_pending', pendingLater), 'a later date is not "today"');
  assert.ok(has(list, 'today_unstaffed', unstaffed));
  assert.ok(!has(list, 'today_unstaffed', staffed), 'two technicians is enough for a pair service');
  assert.ok(!has(list, 'today_unstaffed', staffedOldPair), 'an older lead and helper entry counts as two');
  assert.ok(!has(list, 'today_unstaffed', soloOk), 'a check-up needs one technician');
  assert.ok(has(list, 'today_proof', proof));
  assert.ok(!has(list, 'today_proof', proofLater));
  assert.ok(has(list, 'payment_proof', proofLater), 'it is still under Money');
});

test('a Pending booking that missed its date is as urgent as one dated today; an Approved one is not Pending', () => {
  const missed = booking({ date: '2026-11-02' });
  const items = collectItems({ bookings: [missed], servicesById, now: WED });
  const item = items.find((i) => i.kind === 'today_pending');
  assert.ok(item);
  assert.equal(item.urgency, 'today');
  assert.match(item.label, /past date/);
});

test('Needs a decision: every kind appears when its condition holds and disappears once it is resolved', () => {
  const approval = booking({ date: LATER });
  const approvalTomorrow = booking({ date: TOMORROW });
  const unitOpen = booking({ units: [{ type: 'Split Type', quantity: 1, supplied: { source: 'requested', status: 'Pending', chosenAt: daysAgo(2) } }] });
  const unitSettled = booking({ units: [{ type: 'Split Type', quantity: 1, supplied: { source: 'manual', status: 'Resolved' } }] });
  const decline = booking({ unitDecline: { reason: 'No stock', declinedAt: daysAgo(1) } });
  const declineWithdrawn = booking({ unitDecline: undefined });
  const discount = booking({ status: 'Approved', discount: { status: 'Pending', requestedAt: daysAgo(1) } });
  const discountDone = booking({ discount: { status: 'Approved' } });
  const extension = booking({ status: 'In Progress', date: TODAY, extensionRequest: { status: 'Pending', requestedAt: daysAgo(0) } });
  const extensionDone = booking({ status: 'In Progress', extensionRequest: { status: 'Approved' } });
  const disruption = booking({ status: 'Approved', disruption: { status: 'Reported', reportedAt: daysAgo(0) } });
  const disruptionDone = booking({ status: 'Approved', disruption: { status: 'Rescheduled' } });
  const list = kindsOf([approval, approvalTomorrow, unitOpen, unitSettled, decline, declineWithdrawn, discount, discountDone, extension, extensionDone, disruption, disruptionDone]);

  assert.ok(has(list, 'pending_approval', approval));
  assert.ok(!has(list, 'pending_approval', approvalTomorrow), 'already listed under Today, not twice');
  assert.ok(has(list, 'unit_confirmation', unitOpen));
  assert.ok(!has(list, 'unit_confirmation', unitSettled));
  assert.ok(has(list, 'cannot_supply', decline));
  assert.ok(!has(list, 'cannot_supply', declineWithdrawn));
  assert.ok(has(list, 'discount_review', discount));
  assert.ok(!has(list, 'discount_review', discountDone));
  assert.ok(has(list, 'extension_request', extension));
  assert.ok(!has(list, 'extension_request', extensionDone));
  assert.ok(has(list, 'disruption_report', disruption));
  assert.ok(!has(list, 'disruption_report', disruptionDone));
});

test('back job claims: only an open Not Covered claim needs a decision', () => {
  const claim = (over) => ({ originalBookingId: 'CZ-2026-0001', customer: 'C1', status: 'Not Covered', isOpen: true, reportedAt: daysAgo(3), ...over });
  const open = collectItems({ backJobs: [claim()], now: WED });
  assert.equal(open.length, 1);
  assert.equal(open[0].kind, 'back_job_review');
  assert.equal(open[0].bookingId, 'CZ-2026-0001');
  assert.equal(collectItems({ backJobs: [claim({ status: 'Scheduled' })], now: WED }).length, 0, 'a free visit was already scheduled');
  assert.equal(collectItems({ backJobs: [claim({ status: 'Reviewed', isOpen: false })], now: WED }).length, 0, 'reviewed');
  assert.equal(collectItems({ backJobs: [claim({ isOpen: false })], now: WED }).length, 0, 'closed');
});

test('Money: payment proofs to verify (down payment, balance, or a cancelled booking still being checked) and refunds waiting', () => {
  const down = booking({ status: 'Approved', paymentStatus: 'to_verify' });
  const balance = booking({ status: 'In Progress', paymentStatus: 'partially_paid', balancePaymentStatus: 'to_verify' });
  const cancelledChecking = booking({ status: 'Cancelled', paymentStatus: 'to_verify', paymentCheckAfterCancel: true });
  const cancelledDone = booking({ status: 'Cancelled', paymentStatus: 'to_verify', paymentCheckAfterCancel: false });
  const refund = booking({ status: 'Cancelled', refund: { status: 'Pending', requestedAt: daysAgo(1) } });
  const refundUnverified = booking({ status: 'Cancelled', paymentCheckAfterCancel: true, paymentStatus: 'to_verify', refund: { status: 'Pending', paymentUnverified: true, requestedAt: daysAgo(1) } });
  const refunded = booking({ status: 'Cancelled', refund: { status: 'Processed' } });
  const refundRejected = booking({ status: 'Cancelled', refund: { status: 'Rejected' } });
  const items = collectItems({ bookings: [down, balance, cancelledChecking, cancelledDone, refund, refundUnverified, refunded, refundRejected], servicesById, now: WED });
  const list = items.map((i) => `${i.kind}:${i.bookingId}`);
  assert.ok(has(list, 'payment_proof', down));
  assert.ok(has(list, 'payment_proof', balance));
  assert.ok(has(list, 'payment_proof', cancelledChecking));
  assert.ok(!has(list, 'payment_proof', cancelledDone));
  assert.ok(has(list, 'refund_waiting', refund));
  assert.ok(has(list, 'refund_waiting', refundUnverified));
  assert.ok(!has(list, 'refund_waiting', refunded));
  assert.ok(!has(list, 'refund_waiting', refundRejected));
  assert.match(items.find((i) => i.bookingId === refundUnverified.bookingId && i.kind === 'refund_waiting').label, /payment not verified/);
  assert.match(items.find((i) => i.bookingId === balance.bookingId).label, /^Balance/);
});

test('counts match the items, each group keeps at most 5, and every kind belongs to exactly one group', () => {
  const many = Array.from({ length: 7 }, () => booking({ date: LATER }));
  const groups = buildGroups({ bookings: many, servicesById, now: WED });
  assert.equal(groups.decision.count, 7);
  assert.equal(groups.decision.items.length, ITEMS_PER_GROUP);
  assert.equal(groups.today.count, 0);
  assert.equal(groups.today.items.length, 0);
  const total = collectItems({ bookings: many, servicesById, now: WED }).length;
  assert.equal(groups.today.count + groups.decision.count + groups.money.count, total);
  const all = Object.values(GROUPS).flat();
  assert.equal(new Set(all).size, all.length, 'no kind is in two groups');
  assert.deepEqual(Object.keys(SOON_AFTER_WORKING_DAYS).sort(), [...all].sort(), 'every kind has a threshold');
});

test('urgency: today for a booking dated today or earlier, soon for tomorrow or after waiting long enough, else waiting', () => {
  const urgencyOf = (b) => collectItems({ bookings: [b], servicesById, now: WED }).find((i) => i.kind === 'pending_approval' || i.kind === 'today_pending').urgency;
  assert.equal(urgencyOf(booking({ date: TODAY })), 'today');
  assert.equal(urgencyOf(booking({ date: TOMORROW })), 'soon');
  assert.equal(urgencyOf(booking({ date: LATER, createdAt: daysAgo(0) })), 'waiting', 'made today, booked later');
  assert.equal(urgencyOf(booking({ date: LATER, createdAt: daysAgo(1) })), 'soon', 'Pending since yesterday');
});

test('waiting days skip a closed Sunday', () => {
  assert.equal(workingDaysBetween('2026-11-07', '2026-11-07'), 0);
  assert.equal(workingDaysBetween('2026-11-07', '2026-11-08'), 0, 'Saturday to Sunday: the Sunday does not count');
  assert.equal(workingDaysBetween('2026-11-07', '2026-11-09'), 1, 'Saturday to Monday: only the Monday counts');
  assert.equal(workingDaysBetween('2026-11-06', '2026-11-09'), 2, 'Friday to Monday');
  assert.equal(workingDaysBetween('2026-11-09', '2026-11-04'), 0, 'never negative');
  const saturdayNight = new Date('2026-11-07T14:00:00Z'); // 22:00 Saturday in Manila
  const onSunday = new Date('2026-11-08T04:00:00Z');
  const onMonday = new Date('2026-11-09T04:00:00Z');
  const pending = booking({ date: LATER, createdAt: saturdayNight });
  const at = (now) => collectItems({ bookings: [pending], servicesById, now }).find((i) => i.kind === 'pending_approval');
  assert.equal(at(onSunday).urgency, 'waiting', 'a request made on Saturday has not aged over the closed Sunday');
  assert.equal(at(onSunday).waitingDays, 0);
  assert.equal(at(onMonday).urgency, 'soon', 'on Monday it has waited one working day');
});

test('sorting: urgency first, then the booked date, then the one waiting longest', () => {
  const mk = (over) => ({ id: over.id, urgency: 'waiting', date: null, waitingSince: daysAgo(0).toISOString(), ...over });
  const list = [
    mk({ id: 'waiting-old', waitingSince: daysAgo(9).toISOString() }),
    mk({ id: 'soon-late', urgency: 'soon', date: '2026-11-09' }),
    mk({ id: 'today-b', urgency: 'today', date: TODAY, waitingSince: daysAgo(1).toISOString() }),
    mk({ id: 'today-a', urgency: 'today', date: TODAY, waitingSince: daysAgo(5).toISOString() }),
    mk({ id: 'soon-early', urgency: 'soon', date: TOMORROW }),
    mk({ id: 'waiting-new', waitingSince: daysAgo(1).toISOString() }),
    mk({ id: 'waiting-dated', date: '2026-11-20' }),
  ].sort(compareItems).map((i) => i.id);
  assert.deepEqual(list, ['today-a', 'today-b', 'soon-early', 'soon-late', 'waiting-dated', 'waiting-old', 'waiting-new']);
});

test('a customer whose account is gone shows as Deleted customer, and the internal customer id is not sent', () => {
  const groups = buildGroups({ bookings: [booking({ customer: 'GONE', date: TODAY }), booking({ customer: 'C1', date: TODAY })], servicesById, now: WED });
  const named = withNames(groups, new Map([['C1', 'Ana Cruz']]));
  const names = named.today.items.map((i) => i.customerName).sort();
  assert.deepEqual(names, ['Ana Cruz', 'Deleted customer']);
  assert.equal(named.today.items.every((i) => !('customerId' in i)), true);
});

test('every item has what the panel needs: a kind, a booking number, a label, a date, a waiting time, an urgency and a link', () => {
  const b = booking({ date: TODAY });
  const [item] = collectItems({ bookings: [b], servicesById, now: WED });
  for (const key of ['id', 'kind', 'bookingId', 'label', 'date', 'waitingSince', 'waitingMinutes', 'waitingDays', 'urgency', 'link']) assert.ok(key in item, key);
  assert.equal(item.link, `/admin/services/requests/${b.bookingId}`);
  const money = collectItems({ bookings: [booking({ status: 'Approved', paymentStatus: 'to_verify' })], servicesById, now: WED }).find((i) => i.kind === 'payment_proof');
  assert.match(money.link, /^\/admin\/payments\?filter=to_verify&q=CZ-/);
  const refund = collectItems({ bookings: [booking({ status: 'Cancelled', refund: { status: 'Pending' } })], servicesById, now: WED }).find((i) => i.kind === 'refund_waiting');
  assert.match(refund.link, /^\/admin\/payments\?filter=refund&q=CZ-/);
});

test('it only reads: frozen input is never changed', () => {
  const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };
  const input = deepFreeze({
    bookings: [booking({ date: TODAY, status: 'Approved', paymentStatus: 'to_verify', assignments: [{ lead: 'T1' }], refund: { status: 'Pending' } })],
    backJobs: [{ originalBookingId: 'CZ-2026-0002', customer: 'C1', status: 'Not Covered', isOpen: true, reportedAt: daysAgo(1) }],
    servicesById, now: WED,
  });
  assert.doesNotThrow(() => withNames(buildGroups(input), new Map()));
});

// ---- the route -----------------------------------------------------------------------------------------------------------------------

const orig = {
  userFindById: User.findById, userFind: User.find, bookingFind: Booking.find, backJobFind: BackJob.find, serviceFind: Service.find,
  bookingUpdateOne: Booking.updateOne, bookingUpdateMany: Booking.updateMany, bookingCreate: Booking.create, bookingFindOneAndUpdate: Booking.findOneAndUpdate,
  bookingDeleteOne: Booking.deleteOne, bookingSave: Booking.prototype.save,
};
let server;
let base;
let queries;
let writes;
let rows;

const chainOf = (value) => ({ select() { return this; }, lean() { return this; }, then: (res, rej) => Promise.resolve(value).then(res, rej) });
const token = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { algorithm: 'HS256' });
const get = (as) => fetch(`${base}/api/admin/needs-attention`, { headers: as ? { Authorization: `Bearer ${token(...as)}` } : {} });

test.before(async () => {
  const people = { ADM1: { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }, T1: { _id: 'T1', role: 'staff', isActive: true, name: 'Tech' }, C1: { _id: 'C1', role: 'customer', isActive: true, name: 'Ana Cruz' } };
  User.findById = (id) => chainOf(people[id] || null);
  User.find = (filter) => { queries.push('User.find'); const ids = filter._id.$in.map(String); return chainOf(Object.values(people).filter((p) => ids.includes(p._id))); };
  Booking.find = () => { queries.push('Booking.find'); return chainOf(rows.bookings); };
  BackJob.find = () => { queries.push('BackJob.find'); return chainOf(rows.backJobs); };
  Service.find = () => { queries.push('Service.find'); return chainOf(rows.services); };
  for (const name of ['updateOne', 'updateMany', 'create', 'findOneAndUpdate', 'deleteOne']) Booking[name] = async () => { writes.push(name); return null; };
  Booking.prototype.save = async function save() { writes.push('save'); return this; };

  const app = express();
  app.use('/api/admin', require('../routes/adminNeedsAttentionRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  Object.assign(User, { findById: orig.userFindById, find: orig.userFind });
  Object.assign(Booking, { find: orig.bookingFind, updateOne: orig.bookingUpdateOne, updateMany: orig.bookingUpdateMany, create: orig.bookingCreate, findOneAndUpdate: orig.bookingFindOneAndUpdate, deleteOne: orig.bookingDeleteOne });
  Booking.prototype.save = orig.bookingSave;
  BackJob.find = orig.backJobFind;
  Service.find = orig.serviceFind;
  if (server) server.close();
});

test.beforeEach(() => {
  authCache.clear();
  queries = [];
  writes = [];
  const { manilaTodayKey } = require('../utils/timeBlocks');
  const { addDays } = require('../utils/extensionDays');
  const today = manilaTodayKey();
  rows = {
    bookings: [
      booking({ date: today }),
      booking({ date: addDays(today, 9), status: 'Approved', paymentStatus: 'to_verify', assignments: [{ lead: 'T1' }, { lead: 'T2' }] }),
      booking({ customer: 'GONE', status: 'Cancelled', refund: { status: 'Pending', requestedAt: new Date() } }),
    ],
    backJobs: [{ originalBookingId: 'CZ-2026-0999', customer: 'C1', status: 'Not Covered', isOpen: true, reportedAt: new Date() }],
    services: [pair],
  };
});

test('the endpoint is for admins: no token is 401, a technician or a customer is 403', async () => {
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(['T1', 'staff'])).status, 403);
  assert.equal((await get(['C1', 'customer'])).status, 403);
  assert.deepEqual(queries, [], 'a refused request reads no booking');
});

test('an admin gets the three groups, the total of Today plus Needs a decision, and the names', async () => {
  const res = await get(['ADM1', 'admin']);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body.groups), ['today', 'decision', 'money']);
  assert.equal(body.total, body.groups.today.count + body.groups.decision.count);
  assert.equal(body.groups.today.count, 1);
  assert.equal(body.groups.decision.count, 1, 'the back job claim');
  assert.equal(body.groups.money.count, 2, 'a payment proof and a refund');
  const names = Object.values(body.groups).flatMap((g) => g.items.map((i) => i.customerName));
  assert.ok(names.includes('Ana Cruz'));
  assert.ok(names.includes('Deleted customer'));
  assert.ok(!JSON.stringify(body).includes('customerId'));
  for (const g of Object.values(body.groups)) assert.equal(g.items.length <= 5 && g.count >= g.items.length, true);
});

test('it asks the database at most 4 questions, never one per item, and writes nothing', async () => {
  rows.bookings = Array.from({ length: 12 }, () => booking({ date: '2026-12-31' }));
  const res = await get(['ADM1', 'admin']);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.groups.decision.count, 12 + 1);
  assert.equal(body.groups.decision.items.length, 5);
  assert.ok(queries.length <= 4, queries.join(', '));
  assert.equal(queries.filter((q) => q === 'Booking.find').length, 1);
  assert.equal(queries.filter((q) => q === 'User.find').length <= 1, true);
  assert.deepEqual(writes, [], 'the panel changes no booking, payment or refund');
});

test('when nothing needs attention every group is empty, and the answer is live (a second call sees a changed database)', async () => {
  rows = { bookings: [], backJobs: [], services: [] };
  const empty = await (await get(['ADM1', 'admin'])).json();
  assert.equal(empty.total, 0);
  assert.deepEqual(Object.values(empty.groups).map((g) => g.count), [0, 0, 0]);
  rows.bookings = [booking({ date: '2026-12-31' })];
  const later = await (await get(['ADM1', 'admin'])).json();
  assert.equal(later.groups.decision.count, 1, 'nothing is cached');
});
