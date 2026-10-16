// Run with: npm test (inside server/). The indexes for the main filters are declared, and the admin bookings list can be asked
// for a page at a time (limit and page, at most 1000) while a request with neither still gets everything, as before.
// The real route runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { readPaging, BOOKINGS_PAGE_MAX } = require('../utils/adminInput');
const harness = require('./helpers/createBooking');

const { state, addBooking, callPath } = harness;

const keysOf = (model) => model.schema.indexes().map(([fields]) => JSON.stringify(fields));

test('the main filters have indexes', () => {
  const booking = keysOf(Booking);
  ['{"date":1}', '{"status":1,"date":1}', '{"customer":1}', '{"assignments.lead":1}', '{"assignments.helper":1}', '{"queueRank":1}', '{"status":1,"queueRank":1}', '{"technician":1,"status":1}']
    .forEach((index) => assert.ok(booking.includes(index), `Booking ${index}`));
  assert.ok(keysOf(User).includes('{"role":1,"isActive":1}'), 'User role and active');
  assert.ok(keysOf(Notification).includes('{"user":1,"createdAt":-1}'), 'Notification user and date');
});

test('paging: none asked for means none applied; otherwise a whole limit up to 1000 and a whole page', () => {
  assert.deepEqual(readPaging({}), { paging: null });
  assert.deepEqual(readPaging({ limit: '', page: '' }), { paging: null });
  assert.deepEqual(readPaging({ limit: '50', page: '3' }).paging, { limit: 50, page: 3 });
  assert.deepEqual(readPaging({ limit: '10' }).paging, { limit: 10, page: 1 });
  assert.deepEqual(readPaging({ page: '2' }).paging, { limit: 100, page: 2 });
  assert.deepEqual(readPaging({ limit: String(BOOKINGS_PAGE_MAX) }).paging, { limit: 1000, page: 1 });
  assert.match(readPaging({ limit: '1001' }).problem.message, /cannot be more than 1000/);
  ['0', '-5', '2.5', 'abc'].forEach((limit) => assert.equal(readPaging({ limit }).problem.status, 400, limit));
  ['0', '-1', '1.5', 'x'].forEach((page) => assert.equal(readPaging({ page }).problem.status, 400, page));
  assert.equal(readPaging({ limit: { $ne: '1' } }).problem.status, 400);
});

test.describe('the admin bookings list', () => {
  const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
  test.before(() => harness.install());
  test.after(() => harness.close());
  test.beforeEach(() => {
    harness.reset({
      users: [{ _id: 'CUS1', role: 'customer', isActive: true }, { _id: 'ADM1', role: 'admin', isActive: true }],
      services: [cleaning],
    });
    for (let i = 1; i <= 5; i += 1) {
      addBooking({ bookingId: `CZ-${i}`, customer: 'CUS1', service: cleaning, status: 'Pending', date: '2026-11-01', time: 'Morning', createdAt: `2026-10-0${i}T00:00:00Z` });
    }
    Booking.countDocuments = async () => state.bookings.length;
  });
  const list = async (query = '', as = 'ADM1', role = 'admin') => {
    const token = require('jsonwebtoken').sign({ id: as, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const res = await fetch(`${harness.base()}/api/bookings${query}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
  };

  test('with no limit the whole list comes back, newest first, as before', async () => {
    const res = await list();
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((b) => b.bookingId), ['CZ-5', 'CZ-4', 'CZ-3', 'CZ-2', 'CZ-1']);
    assert.equal(res.headers.get('x-total-count'), null, 'no paging headers when none was asked for');
  });

  test('a limit and page give just that page, with the total in a header', async () => {
    const second = await list('?limit=2&page=2');
    assert.deepEqual(second.body.map((b) => b.bookingId), ['CZ-3', 'CZ-2']);
    assert.equal(second.headers.get('x-total-count'), '5');
    assert.equal(second.headers.get('x-page'), '2');
    assert.equal(second.headers.get('x-limit'), '2');
    assert.equal((await list('?limit=2&page=3')).body.length, 1);
    assert.equal((await list('?limit=2&page=9')).body.length, 0);
  });

  test('more than 1000 in a page, or a limit that is not a number, is a 400 with a clear message', async () => {
    const tooMany = await list('?limit=1001');
    assert.equal(tooMany.status, 400);
    assert.match(tooMany.body.message, /cannot be more than 1000/);
    assert.equal((await list('?limit=abc')).status, 400);
    assert.equal((await list('?page=0')).status, 400);
  });

  test('an operator written into the query string is never read as paging', async () => {
    const res = await list('?limit[$gt]=1');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 5);
  });

  test('only an admin can list every booking', async () => {
    assert.equal((await list('', 'CUS1', 'customer')).status, 403);
    void callPath;
  });
});
