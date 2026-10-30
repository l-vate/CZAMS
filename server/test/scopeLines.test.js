// Run with: npm test (inside server/). The scope of works on a booking (E13-3): the real routes and the real auth run in a tiny Express
// app, only the database calls are stubbed, so no database is needed. Covers who may change it, which statuses, the totals and VAT,
// that the down payment never moves, the block below what is already paid, how the discount sees each kind of line, the audit trail,
// the customer's notification and that the distance charge is never counted twice.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { authCache } = require('../utils/authCache');
const { chain } = require('./helpers/memoryQueries');
const { getBookingBasePrice, getPaymentBreakdown, getDiscountAmount, getBookingUnitsSubtotal } = require('../utils/pricing');
const { toCustomerView } = require('../utils/customerView');

const accounts = {
  ADM1: { role: 'admin', isActive: true },
  STF1: { role: 'staff', isActive: true },
  CUS1: { role: 'customer', isActive: true },
  CUS2: { role: 'customer', isActive: true },
};
let doc;
let notes;
let audits;
let server;
let base;

// A booking document with just what the routes use: a plain object that can be saved, populated and turned into a plain object.
function makeBooking(over = {}) {
  const b = {
    bookingId: 'CZ-1', customer: 'CUS1', status: 'Pending', isCommercial: false, downPaymentPercent: 50,
    paymentStatus: 'Unpaid', balancePaymentStatus: 'None', distanceAdjustment: 0, mobilizationFee: 0, scopeLines: [],
    service: { name: 'Repair', serviceType: 'Repair', price: 1000, unitTypePricing: [] },
    units: [{ type: 'Split Type', quantity: 2 }], discount: { status: 'None' },
    toObject() { return JSON.parse(JSON.stringify(this)); }, // functions are left out
    // Mongoose gives every new line an id when it is saved
    async save() { this.scopeLines.forEach((l, i) => { if (!l._id) l._id = `L${i}-${this.scopeLines.length}`; }); return this; },
    async populate() { return this; },
    ...over,
  };
  return b;
}

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, ...accounts[id] } : null);
  Booking.findOne = () => ({ populate: async () => doc });
  Notification.create = async (d) => { notes.push(d); return d; };
  AuditLog.create = async (d) => { audits.push(d); return d; };
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/scopeLineRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(() => { authCache.clear(); doc = makeBooking(); notes = []; audits = []; });

const call = async (method, path, body, as = 'ADM1') => {
  const token = jwt.sign({ id: as, role: accounts[as].role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/bookings/CZ-1/scope-lines${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const add = (over = {}, as) => call('POST', '', { kind: 'installation', quantity: 2, unitRate: 1500, ...over }, as);

// ---- who and when
test('only an admin can add, change or remove a line: staff and customers get 403', async () => {
  for (const as of ['STF1', 'CUS1']) {
    assert.equal((await add({}, as)).status, 403, as);
    assert.equal((await call('PATCH', '/abc', { reason: 'fix it' }, as)).status, 403, as);
    assert.equal((await call('DELETE', '/abc', { reason: 'fix it' }, as)).status, 403, as);
  }
  assert.equal(doc.scopeLines.length, 0);
});

test('lines can be changed while Pending, Approved or In Progress, and not after Completed or Cancelled', async () => {
  for (const status of ['Pending', 'Approved', 'In Progress']) {
    doc = makeBooking({ status });
    assert.equal((await add()).status, 200, status);
  }
  for (const status of ['Completed', 'Cancelled']) {
    doc = makeBooking({ status });
    const res = await add();
    assert.equal(res.status, 400, status);
    assert.match(res.body.message, /Pending, Approved or In Progress/);
    assert.equal(doc.scopeLines.length, 0);
  }
});

// ---- the line itself
test('a preset line fills in its description and unit, and the amount is quantity times rate', async () => {
  const res = await call('POST', '', { kind: 'excessPipe', quantity: 12, unitRate: 150 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const line = doc.scopeLines[0];
  assert.equal(line.description, 'Excess pipe');
  assert.equal(line.unitLabel, 'foot');
  assert.equal(line.amount, 1800);
  assert.equal(line.addedBy, 'ADM1');
  assert.ok(line.addedAt);
});

test('an Other line needs a description; a bad kind, quantity or rate is refused', async () => {
  assert.equal((await call('POST', '', { kind: 'other', quantity: 1, unitRate: 100 })).status, 400);
  assert.equal((await call('POST', '', { kind: 'other', description: 'Wall bracket', quantity: 1, unitRate: 100 })).status, 200);
  for (const bad of [{ kind: 'bogus' }, { quantity: 0 }, { quantity: -1 }, { unitRate: -5 }, { unitRate: 'x' }, { quantity: 1e9 }]) {
    assert.equal((await add(bad)).status, 400, JSON.stringify(bad));
  }
});

// ---- totals, VAT and the down payment
test('adding a line raises the total and the balance, and the down payment (the base price only) does not move', async () => {
  const before = getPaymentBreakdown(doc);
  assert.equal(before.total, 2000);
  assert.equal(before.downPayment, 1000);
  await add({ kind: 'dismantling', quantity: 2, unitRate: 1500 });
  const after = getPaymentBreakdown(doc);
  assert.equal(after.total, 5000);
  assert.equal(after.downPayment, 1000, 'the down payment is the percent of the base price: scope lines follow in the balance');
  assert.equal(after.balance, 4000);
});

test('once a down payment proof is sent its amount is fixed: a new line only moves the balance', async () => {
  doc = makeBooking({ paymentStatus: 'to_verify', downPaymentPaidAmount: 1000 });
  await add({ kind: 'dismantling', quantity: 2, unitRate: 1500 });
  const after = getPaymentBreakdown(doc);
  assert.equal(after.total, 5000);
  assert.equal(after.downPayment, 1000, 'the amount that was sent does not move');
  assert.equal(after.balance, 4000);
});

test('a distance line and a supplied unit are not part of the down payment', async () => {
  doc = makeBooking();
  await call('POST', '', { kind: 'distance', quantity: 1, unitRate: 500 });
  assert.equal(getPaymentBreakdown(doc).total, 2500);
  assert.equal(getPaymentBreakdown(doc).downPayment, 1000);
});

test('an already paid down payment keeps its recorded amount', async () => {
  doc = makeBooking({ status: 'Approved', paymentStatus: 'partially_paid', downPaymentPaidAmount: 1000 });
  await add();
  assert.equal(doc.downPaymentPaidAmount, 1000);
  assert.equal(doc.paymentStatus, 'partially_paid');
  assert.equal(getPaymentBreakdown(doc).downPayment, 1000);
});

test('a commercial booking gets its VAT worked out again from the new price', async () => {
  doc = makeBooking({ isCommercial: true, vatAmount: 240 });
  await add({ kind: 'dismantling', quantity: 1, unitRate: 1000 });
  assert.equal(getBookingBasePrice(doc), 3000);
  assert.equal(doc.vatAmount, 360);
  doc = makeBooking({ isCommercial: true, taxInclusive: true, vatAmount: 0 });
  await add({ kind: 'dismantling', quantity: 1, unitRate: 1000 });
  assert.equal(doc.vatAmount, Math.round((3000 * 12) / 112), 'quoted prices already include VAT: the VAT is the part inside the price');
});

test('a residential booking gets no VAT', async () => {
  await add();
  assert.equal(doc.vatAmount === undefined || doc.vatAmount === 0, true);
});

test('a change that would drop the total below what is already paid is blocked and points to the refund flow', async () => {
  doc = makeBooking({
    status: 'Approved', paymentStatus: 'fully_paid', downPaymentPercent: 100, downPaymentPaidAmount: 4000,
    scopeLines: [{ _id: 'L1', kind: 'installation', description: 'Installation', quantity: 1, unitLabel: 'unit', unitRate: 2000, amount: 2000 }],
    units: [{ type: 'Split Type', quantity: 2 }],
  });
  // total is now 2000 units + 2000 line = 4000; removing the line drops it to 2000, under the 4000 paid
  const res = await call('DELETE', '/L1', { reason: 'wrong quote' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /refund flow/);
  assert.equal(doc.scopeLines.length, 1);
});

test('once the balance is paid or waiting to be checked, the lines can no longer change the total', async () => {
  for (const balancePaymentStatus of ['paid', 'to_verify']) {
    doc = makeBooking({ status: 'Approved', paymentStatus: 'partially_paid', balancePaymentStatus });
    const res = await add();
    assert.equal(res.status, 400, balancePaymentStatus);
    assert.match(res.body.message, /refund flow/);
  }
});

// ---- the discount
test('the Senior/PWD discount takes its percent off the service lines and never off a distance line', async () => {
  doc = makeBooking({ discount: { status: 'Approved', type: 'Senior', percent: 20 } });
  await add({ kind: 'installation', quantity: 1, unitRate: 1000 });
  await call('POST', '', { kind: 'distance', quantity: 1, unitRate: 500 });
  // units 2000 less 20% (400) = 1600; installation 1000 less 20% (200) = 800; distance 500 untouched
  assert.equal(getDiscountAmount(doc), 600);
  assert.equal(getBookingUnitsSubtotal(doc), 1600, 'the down payment base only changes by the discount on the units');
  assert.equal(getBookingBasePrice(doc), 1600 + 800 + 500);
  // the down payment works off the base price only: the discounted units 1600 at the booking's percent
  assert.equal(getPaymentBreakdown(doc).downPayment, 800);
});

test('every kind is classified: dismantling, installation, excess pipe and other are discounted, distance is not', async () => {
  doc = makeBooking({ discount: { status: 'Approved', type: 'PWD', percent: 20 }, units: [] });
  for (const [kind, description] of [['dismantling', ''], ['installation', ''], ['excessPipe', ''], ['other', 'Wall bracket'], ['distance', '']]) {
    const before = getBookingBasePrice(doc);
    const res = await call('POST', '', { kind, description, quantity: 1, unitRate: 1000 });
    assert.equal(res.status, 200, kind);
    const added = Math.round((getBookingBasePrice(doc) - before) * 100) / 100;
    assert.equal(added, kind === 'distance' ? 1000 : 800, kind);
  }
});

// ---- edits and removals
test('an edit and a removal need a reason', async () => {
  await add();
  const id = String(doc.scopeLines[0]._id);
  assert.equal((await call('PATCH', `/${id}`, { quantity: 3 })).status, 400);
  assert.equal((await call('PATCH', `/${id}`, { quantity: 3, reason: 'x' })).status, 400);
  assert.equal((await call('DELETE', `/${id}`, {})).status, 400);
  assert.equal(doc.scopeLines.length, 1);
});

test('an edit changes the line and the total; a removal takes it away; both are recorded and told to the customer', async () => {
  await add({ kind: 'installation', quantity: 2, unitRate: 1500 });
  const id = String(doc.scopeLines[0]._id);

  const edit = await call('PATCH', `/${id}`, { quantity: 3, reason: 'a third unit' });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(doc.scopeLines[0].amount, 4500);
  assert.equal(getBookingBasePrice(doc), 6500);

  const removal = await call('DELETE', `/${id}`, { reason: 'customer dropped it' });
  assert.equal(removal.status, 200);
  assert.equal(doc.scopeLines.length, 0);
  assert.equal(getBookingBasePrice(doc), 2000);

  assert.deepEqual(audits.map((a) => a.action), ['scope_line.add', 'scope_line.edit', 'scope_line.remove']);
  const editAudit = audits[1];
  assert.equal(editAudit.meta.reason, 'a third unit');
  assert.equal(editAudit.meta.before.quantity, 2);
  assert.equal(editAudit.meta.after.quantity, 3);
  assert.equal(editAudit.actor.id, 'ADM1');
  assert.equal(audits[2].meta.reason, 'customer dropped it');

  assert.equal(notes.length, 3);
  notes.forEach((n) => { assert.equal(n.type, 'scope_updated'); assert.equal(n.user, 'CUS1'); });
  assert.match(notes[0].message, /was added to the scope of works\. Your new total is ₱5,000\./);
  assert.match(notes[1].message, /was changed to .*Your new total is ₱6,500\./);
  assert.match(notes[2].message, /was removed from the scope of works\. Your new total is ₱2,000\./);
});

test('a line that does not exist is a 404', async () => {
  assert.equal((await call('PATCH', '/nope', { reason: 'fix it' })).status, 404);
  assert.equal((await call('DELETE', '/nope', { reason: 'fix it' })).status, 404);
});

// ---- the distance charge is one charge
test('a distance line and the distance based charge field are one charge: the total counts it once', async () => {
  doc = makeBooking({ distanceAdjustment: 700 });
  assert.equal(getBookingBasePrice(doc), 2700, 'the old field alone counts');
  const res = await call('POST', '', { kind: 'distance', quantity: 1, unitRate: 900 });
  assert.equal(res.status, 200);
  assert.equal(doc.distanceAdjustment, 900, 'the field follows the distance lines');
  assert.equal(getBookingBasePrice(doc), 2900, '900 once, not 900 + 700 and not 900 + 900');
  assert.equal(audits[0].meta.replacedDistanceAdjustment, 700, 'what the line replaced is on the audit line');
  await call('DELETE', `/${String(doc.scopeLines[0]._id)}`, { reason: 'not needed' });
  assert.equal(doc.distanceAdjustment, 0);
  assert.equal(getBookingBasePrice(doc), 2000);
});

test('the mobilization fee is its own charge and is not touched by the lines', async () => {
  doc = makeBooking({ mobilizationFee: 2500 });
  await call('POST', '', { kind: 'distance', quantity: 1, unitRate: 300 });
  assert.equal(doc.mobilizationFee, 2500);
  assert.equal(getBookingBasePrice(doc), 2000 + 300 + 2500);
});

test('a booking with no lines is priced exactly as before', () => {
  const b = makeBooking({ distanceAdjustment: 100, mobilizationFee: 50 });
  assert.equal(getBookingBasePrice(b), 2150);
  assert.equal(getPaymentBreakdown(b).downPayment, 1000);
});

// ---- the customer's view
test('the customer sees the scope of works as a breakdown, without who added it', async () => {
  await add();
  const view = toCustomerView(doc);
  assert.equal(view.scopeLines.length, 1);
  assert.deepEqual(Object.keys(view.scopeLines[0]).sort(), ['addedAt', 'amount', 'description', 'kind', 'quantity', 'unitLabel', 'unitRate']);
  assert.equal(view.scopeLines[0].amount, 3000);
});

// ---- the installation is already in an Installation's price (E25)
test('an Installation line cannot be added to an Installation service, which would charge the installation twice', async () => {
  doc = makeBooking({ service: { name: 'Installation', serviceType: 'Installation', price: 1000, unitTypePricing: [] } });
  const refused = await add({ kind: 'installation', quantity: 1, unitRate: 1000 });
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /charge it twice|twice/);
  assert.equal(doc.scopeLines.length, 0);
  assert.equal(getBookingBasePrice(doc), 2000, 'the price is unchanged');
  // other work is still allowed on an Installation
  assert.equal((await add({ kind: 'dismantling', quantity: 1, unitRate: 800 })).status, 200);
  assert.equal(getBookingBasePrice(doc), 2800);
});

test('a service that is not an Installation can still have an Installation line', async () => {
  const ok = await add({ kind: 'installation', quantity: 1, unitRate: 1000 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(getBookingBasePrice(doc), 3000);
});

test('an Installation line that was already on an Installation booking can still be edited', async () => {
  doc = makeBooking({
    service: { name: 'Installation', serviceType: 'Installation', price: 1000, unitTypePricing: [] },
    scopeLines: [{ _id: 'L1', kind: 'installation', description: 'Installation', quantity: 1, unitLabel: 'unit', unitRate: 2000, amount: 2000 }],
  });
  const edited = await call('PATCH', '/L1', { quantity: 2, reason: 'two units' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
});
