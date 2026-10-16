// Run with: npm test (inside server/). A filed service report can be read, but not filed, by the helper and the other
// leads on the job and by the customer who owns the booking. Nobody else can read it, and the customer sees only what
// a customer may see of the booking. The real route and the real auth middleware run in a tiny Express app; only the
// database calls are stubbed, so no database is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const User = require('../models/User');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const { authCache } = require('../utils/authCache');
const { chain } = require('./helpers/memoryQueries');

const accounts = { ADM1: 'admin', CUS1: 'customer', CUS2: 'customer', T1: 'staff', T2: 'staff', T3: 'staff', T4: 'staff', T9: 'staff' };
let server;
let base;

const booking = {
  _id: 'B1', bookingId: 'CZ-1', customer: 'CUS1', service: { name: 'Cleaning', serviceType: 'Cleaning' }, status: 'Completed',
  date: '2026-10-01', time: 'Morning', address: 'Somewhere', technician: 'T1', technicianInstructions: 'Gate code 1234',
  assignments: [{ lead: 'T1', helper: 'T2' }, { lead: 'T3', helper: 'T4' }], paymentStatus: 'paid', extensionDays: [],
};
booking.populate = () => booking;
booking.toObject = () => ({ ...booking });
const report = { _id: 'R1', bookingId: 'CZ-1', booking: 'B1', technicianId: 'T1', workSummary: 'Cleaned both units' };
report.toObject = () => ({ ...report });

test.before(async () => {
  User.findById = (id) => chain(accounts[id] ? { _id: id, role: accounts[id], isActive: true } : null);
  User.findOne = (f) => chain({ _id: f && f._id, name: 'Tech One', email: 't@x' });
  Report.findOne = () => chain(report);
  Booking.findOne = () => chain(booking);
  Booking.findById = () => chain(booking);

  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../routes/reportRoutes'));
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());
test.beforeEach(() => authCache.clear());

const read = async (as) => {
  const token = jwt.sign({ id: as, role: accounts[as] }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${base}/api/reports/booking/CZ-1`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('the author lead, the second lead, both helpers, the owning customer and the admin can read the report', async () => {
  for (const who of ['T1', 'T3', 'T2', 'T4', 'CUS1', 'ADM1']) {
    const res = await read(who);
    assert.equal(res.status, 200, who);
    assert.equal(res.body.workSummary, 'Cleaned both units', who);
  }
});

test('another customer and a technician who is not on the job cannot read it', async () => {
  for (const who of ['CUS2', 'T9']) assert.equal((await read(who)).status, 403, who);
});

test('the customer reads the booking in its customer view: no instructions for the technicians', async () => {
  const res = await read('CUS1');
  assert.equal(res.body.bookingDetails.technicianInstructions, undefined);
  assert.equal(res.body.bookingDetails.bookingId, 'CZ-1');
});
