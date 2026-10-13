// Run with: npm test (inside server/). A customer can send a down payment proof only while the booking is Pending or
// Approved and no proof is waiting or verified, and a balance proof only when a balance is due. A refused request
// changes nothing, never overwrites a verified proof, never touches the amount on file, and leaves no file behind.
// The real routes and the real auth middleware run in a tiny Express app; only the database calls are stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const { authCache } = require('../utils/authCache');
const { UPLOADS_ROOT } = require('../utils/uploadSafety');
const { downPaymentProblem, balanceProblem } = require('../utils/paymentGuards');
const { matches, chain } = require('./helpers/memoryQueries');
const { PNG_DATA_URL } = require('./helpers/signature');

const accounts = { CUS1: 'customer', CUS2: 'customer', ADM1: 'admin' };
const PROOFS = path.join(UPLOADS_ROOT, 'proofs');
const PNG_BYTES = Buffer.from(PNG_DATA_URL.split(',')[1], 'base64');
let DB;
let server;
let base;
let filesBefore;

const booking = (over = {}) => ({
  toObject() { return { ...this }; },
  _id: 'oid-1', bookingId: 'CZ-1', customer: 'CUS1', service: { name: 'Cleaning', price: 1000 }, status: 'Approved',
  units: [{ type: 'Window', quantity: 1 }], paymentMode: 'GCash', paymentMode2: 'GCash', downPaymentPercent: 50,
  paymentStatus: 'Unpaid', balancePaymentStatus: 'None', refund: {}, ...over,
});

test.before(async () => {
  filesBefore = new Set(fs.existsSync(PROOFS) ? fs.readdirSync(PROOFS) : []);
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  Booking.findOne = (f) => chain(DB.find((d) => matches(d, f)) || null);
  Booking.findOneAndUpdate = (f, update) => {
    const found = DB.find((d) => matches(d, f));
    if (found) Object.assign(found, update.$set);
    return chain(found || null);
  };
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', require('../routes/bookingRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server && server.close();
  if (fs.existsSync(PROOFS)) fs.readdirSync(PROOFS).filter((f) => !filesBefore.has(f)).forEach((f) => fs.unlinkSync(path.join(PROOFS, f)));
});
test.beforeEach(() => { authCache.clear(); DB = [booking()]; });

const newFiles = () => (fs.existsSync(PROOFS) ? fs.readdirSync(PROOFS) : []).filter((f) => !filesBefore.has(f));
const send = async (route, as = 'CUS1', { reference = 'GC123456', file = true, id = 'CZ-1' } = {}) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const form = new FormData();
  if (reference) form.append('referenceNumber', reference);
  if (file) form.append('proof', new Blob([PNG_BYTES], { type: 'image/png' }), 'proof.png');
  const res = await fetch(`${base}/api/bookings/${id}/${route}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ---- the rules on their own
test('down payment: allowed for Pending or Approved with nothing sent or after a rejection', () => {
  ['Pending', 'Approved'].forEach((status) => ['Unpaid', 'rejected'].forEach((paymentStatus) => {
    assert.equal(downPaymentProblem(booking({ status, paymentStatus })), null, `${status} ${paymentStatus}`);
  }));
});

test('down payment: refused for every other booking status and for every payment already sent or verified', () => {
  ['In Progress', 'Completed', 'Cancelled'].forEach((status) => assert.equal(downPaymentProblem(booking({ status })).status, 400, status));
  ['to_verify', 'partially_paid', 'fully_paid'].forEach((paymentStatus) => assert.equal(downPaymentProblem(booking({ paymentStatus })).status, 400, paymentStatus));
  assert.equal(downPaymentProblem(booking({ downPaymentPercent: 0 })).status, 400, 'no down payment is due');
});

test('balance: allowed once the down payment is verified, on Approved, In Progress or Completed', () => {
  ['Approved', 'In Progress', 'Completed'].forEach((status) => {
    assert.equal(balanceProblem(booking({ status, paymentStatus: 'partially_paid' }), 500), null, status);
  });
  assert.equal(balanceProblem(booking({ paymentStatus: 'partially_paid', balancePaymentStatus: 'rejected' }), 500), null, 'after a rejection');
  assert.equal(balanceProblem(booking({ paymentStatus: 'partially_paid', balancePaymentStatus: undefined }), 500), null, 'an old booking with no balance status');
  assert.equal(balanceProblem(booking({ downPaymentPercent: 0, paymentStatus: 'Unpaid' }), 1000), null, 'no down payment, the whole total is the balance');
});

test('balance: refused when cancelled, pending, the down payment is not verified, nothing is due, or one is waiting or paid', () => {
  assert.equal(balanceProblem(booking({ status: 'Cancelled', paymentStatus: 'partially_paid' }), 500).status, 400);
  assert.equal(balanceProblem(booking({ status: 'Pending', paymentStatus: 'partially_paid' }), 500).status, 400);
  assert.match(balanceProblem(booking({ paymentStatus: 'to_verify' }), 500).message, /down payment/);
  assert.match(balanceProblem(booking({ paymentStatus: 'fully_paid' }), 0).message, /No balance/);
  assert.match(balanceProblem(booking({ paymentStatus: 'partially_paid', balancePaymentStatus: 'to_verify' }), 500).message, /waiting/);
  assert.match(balanceProblem(booking({ paymentStatus: 'partially_paid', balancePaymentStatus: 'paid' }), 500).message, /already been verified/);
});

// ---- through the real routes
test('a first down payment is accepted: status becomes to_verify, the proof is saved, the amount on file is not set', async () => {
  const res = await send('pay');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(DB[0].paymentStatus, 'to_verify');
  assert.match(DB[0].proofFile, /^\/uploads\/proofs\//);
  assert.equal(DB[0].downPaymentPaidAmount, undefined, 'only the admin verification records the amount');
});

test('a down payment sent again is refused, the first proof stays, and the new file is deleted', async () => {
  await send('pay');
  const firstProof = DB[0].proofFile;
  const filesAfterFirst = newFiles().length;
  const again = await send('pay');
  assert.equal(again.status, 400);
  assert.equal(DB[0].proofFile, firstProof);
  assert.equal(newFiles().length, filesAfterFirst, 'the refused upload left no file behind');
});

test('every refused state leaves no file and changes nothing', async () => {
  const cases = [
    ['pay', { status: 'In Progress' }], ['pay', { status: 'Completed' }], ['pay', { status: 'Cancelled' }],
    ['pay', { paymentStatus: 'partially_paid', proofFile: '/uploads/proofs/verified.png' }],
    ['pay', { paymentStatus: 'fully_paid', proofFile: '/uploads/proofs/verified.png' }],
    ['pay-balance', { status: 'Cancelled', paymentStatus: 'partially_paid' }],
    ['pay-balance', { paymentStatus: 'Unpaid' }],
    ['pay-balance', { paymentStatus: 'partially_paid', balancePaymentStatus: 'paid', balanceProofFile: '/uploads/proofs/b.png' }],
  ];
  for (const [route, over] of cases) {
    DB = [booking(over)];
    const snapshot = JSON.stringify(DB[0]);
    const before = newFiles().length;
    const res = await send(route);
    assert.equal(res.status, 400, `${route} ${JSON.stringify(over)}`);
    assert.equal(JSON.stringify(DB[0]), snapshot, 'nothing changed');
    assert.equal(newFiles().length, before, 'no file left behind');
  }
});

test('after a rejection the customer can send a new down payment', async () => {
  DB = [booking({ paymentStatus: 'rejected' })];
  assert.equal((await send('pay')).status, 200);
  assert.equal(DB[0].paymentStatus, 'to_verify');
});

test('a refused proof for a missing reference deletes its file too', async () => {
  const before = newFiles().length;
  const res = await send('pay', 'CUS1', { reference: '' });
  assert.equal(res.status, 400);
  assert.equal(newFiles().length, before);
});

test('two submissions at the same moment: only one wins', async () => {
  const before = newFiles().length;
  const results = await Promise.all([send('pay'), send('pay')]);
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(newFiles().length - before, 1, 'only the winning proof is kept');
});

test('the balance: accepted when due, refused the second time', async () => {
  DB = [booking({ paymentStatus: 'partially_paid' })];
  assert.equal((await send('pay-balance')).status, 200);
  assert.equal(DB[0].balancePaymentStatus, 'to_verify');
  assert.equal((await send('pay-balance')).status, 400);
});

test('another customer cannot pay on this booking, and the file is removed', async () => {
  const before = newFiles().length;
  assert.equal((await send('pay', 'CUS2')).status, 404);
  assert.equal((await send('pay-balance', 'CUS2')).status, 404);
  assert.equal(DB[0].paymentStatus, 'Unpaid');
  assert.equal(newFiles().length, before);
});

test('a refused repeat does not change the refund amount a cancellation would use', async () => {
  DB = [booking({ paymentStatus: 'partially_paid', downPaymentPaidAmount: 500, proofFile: '/uploads/proofs/verified.png' })];
  await send('pay');
  await send('pay-balance');
  assert.equal(DB[0].downPaymentPaidAmount, 500);
  assert.equal(DB[0].paymentStatus, 'partially_paid');
});
