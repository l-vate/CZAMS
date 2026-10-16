// Run with: npm test (inside server/). A booking carries the prices it was made at. Editing a service changes only
// bookings made afterwards; archiving a service keeps old bookings working; a service used by any booking cannot be
// deleted for good; an old booking with no snapshot still follows the service's current price (nothing is migrated).
// The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const { authCache } = require('../utils/authCache');
const User = require('../models/User');
const { getBookingBasePrice, getPaymentBreakdown } = require('../utils/pricing');
const { buildPriceSnapshot } = require('../utils/priceSnapshot');
const { toCustomerView } = require('../utils/customerView');
const { chain } = require('./helpers/memoryQueries');
const harness = require('./helpers/createBooking');

const { state, post } = harness;

const cleaning = () => ({ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true, unitTypePricing: [{ unitType: 'Split Type', price: 1200 }] });

// ---- the pure rules
test('the snapshot records the price of each unit line, the service name, type and tier', () => {
  const snap = buildPriceSnapshot(cleaning(), [{ type: 'Split Type', quantity: 2 }, { type: 'Window Type', quantity: 1 }]);
  assert.equal(snap.serviceId, 'S-CLEAN');
  assert.equal(snap.serviceName, 'Cleaning');
  assert.equal(snap.serviceType, 'Cleaning');
  assert.equal(snap.tier, 'Cleaning');
  assert.deepEqual(snap.lines.map((l) => [l.type, l.quantity, l.unitPrice, l.lineTotal]), [['Split Type', 2, 1200, 2400], ['Window Type', 1, 1000, 1000]]);
});

test('editing the service after the booking does not change the booking total, the down payment or the balance', () => {
  const service = cleaning();
  const units = [{ type: 'Split Type', quantity: 2 }];
  const booking = { service, units, priceSnapshot: buildPriceSnapshot(service, units), downPaymentPercent: 50, paymentStatus: 'fully_paid' };
  const before = getPaymentBreakdown(booking);
  assert.equal(before.total, 2400);
  service.price = 5000;
  service.unitTypePricing = [{ unitType: 'Split Type', price: 9999 }];
  assert.deepEqual(getPaymentBreakdown(booking), before);
  assert.equal(getBookingBasePrice(booking), 2400);
});

test('a booking made with no snapshot (an old one) still follows the current price, as before', () => {
  const service = cleaning();
  const old = { service, units: [{ type: 'Split Type', quantity: 2 }], downPaymentPercent: 50 };
  assert.equal(getBookingBasePrice(old), 2400);
  service.unitTypePricing = [{ unitType: 'Split Type', price: 1500 }];
  assert.equal(getBookingBasePrice(old), 3000);
});

test('a snapshot whose line does not match the unit (a unit changed afterwards) falls back to the service price', () => {
  const service = cleaning();
  const booking = { service, units: [{ type: 'Window Type', quantity: 1 }], priceSnapshot: { lines: [{ type: 'Split Type', quantity: 1, unitPrice: 1200 }] } };
  assert.equal(getBookingBasePrice(booking), 1000);
});

test('the customer receives the snapshot, so the customer screens total the same as the server', () => {
  const service = cleaning();
  const units = [{ type: 'Split Type', quantity: 1 }];
  const view = toCustomerView({ bookingId: 'CZ-1', status: 'Pending', service, units, priceSnapshot: buildPriceSnapshot(service, units) });
  assert.equal(view.priceSnapshot.lines[0].unitPrice, 1200);
});

test('an archived service still prices and names an old booking', () => {
  const service = { ...cleaning(), isArchived: true, isActive: false };
  const units = [{ type: 'Split Type', quantity: 1 }];
  const booking = { service, units, priceSnapshot: buildPriceSnapshot(service, units) };
  assert.equal(getBookingBasePrice(booking), 1200);
});

// ---- through the booking route
test.describe('creating bookings', () => {
  test.before(() => harness.install());
  test.after(() => harness.close());
  test.beforeEach(() => harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
    services: [cleaning()],
  }));

  test('a new booking stores its snapshot; after the price is edited an old booking keeps its total and a new one uses the new price', async () => {
    const first = await post({ units: [{ type: 'Split Type', quantity: 2 }] });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const stored = state.bookings[0];
    assert.equal(stored.priceSnapshot.lines[0].unitPrice, 1200);
    assert.equal(first.body.priceSnapshot.lines[0].lineTotal, 2400, 'the customer gets it too');

    state.services[0].unitTypePricing = [{ unitType: 'Split Type', price: 2000 }];
    const second = await post({ units: [{ type: 'Split Type', quantity: 2 }], date: harness.goodDate(9) }); // another day: the same booking twice is refused
    assert.equal(second.status, 201);
    const later = state.bookings[1];
    assert.equal(later.priceSnapshot.lines[0].unitPrice, 2000, 'the new booking uses the new price');

    const withService = (b) => ({ ...b, service: state.services[0] });
    assert.equal(getBookingBasePrice(withService(stored)), 2400, 'the old booking is unchanged');
    assert.equal(getBookingBasePrice(withService(later)), 4000);
  });

  test('an archived service cannot be booked', async () => {
    state.services[0].isArchived = true;
    const res = await post({});
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not available/);
  });
});

// ---- the service routes: archive, and the refused hard delete
test.describe('deleting services', () => {
  let server;
  let base;
  let services;
  let used;
  const token = (as) => jwt.sign({ id: as, role: as === 'ADM1' ? 'admin' : 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const del = async (path, as = 'ADM1') => {
    const res = await fetch(`${base}/api/services/${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token(as)}` } });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  test.before(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-a-real-one';
    User.findById = (id) => chain({ _id: id, role: id === 'ADM1' ? 'admin' : 'customer', isActive: true });
    Service.findById = (id) => Promise.resolve(services.find((s) => s._id === id) || null);
    Service.deleteOne = async ({ _id }) => { services = services.filter((s) => s._id !== _id); };
    Booking.countDocuments = async () => used;
    const app = express();
    app.use(express.json());
    app.use('/api/services', require('../routes/serviceRoutes'));
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.after(() => server && server.close());
  test.beforeEach(() => {
    authCache.clear();
    used = 0;
    services = [{ ...cleaning(), save: async function save() { return this; } }];
  });

  test('delete archives the service: hidden and not bookable, nothing removed', async () => {
    const res = await del('S-CLEAN');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(services.length, 1);
    assert.equal(services[0].isArchived, true);
    assert.equal(services[0].isActive, false);
    assert.match(res.body.message, /archived/);
  });

  test('a hard delete is refused with a 409 while any booking uses the service', async () => {
    used = 3;
    const res = await del('S-CLEAN?hard=true');
    assert.equal(res.status, 409);
    assert.match(res.body.message, /used by 3 bookings.*Archive it instead/);
    assert.equal(services.length, 1);
  });

  test('a service no booking uses can be removed for good', async () => {
    const res = await del('S-CLEAN?hard=true');
    assert.equal(res.status, 200);
    assert.equal(services.length, 0);
  });

  test('only an admin can archive or delete', async () => {
    assert.equal((await del('S-CLEAN', 'CUS1')).status, 403);
    assert.equal(services[0].isArchived, undefined);
  });
});
