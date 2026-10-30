// Run with: npm test (inside server/). Admin screen correctness that needs no browser: chat unread is tracked per admin; a
// discount cannot be approved on a Completed or Cancelled booking; month buckets, report ranges and the date pickers' earliest
// date are Manila days whatever time zone the browser is in (run in several zones and compared); a deleted customer is
// "Unknown", not Residential; the dashboard shows an error with Retry and keeps back job visits out of "Total Bookings".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-a-real-one';

const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { authCache } = require('../utils/authCache');
const { chain } = require('./helpers/memoryQueries');
// conversation ids are MongoDB ObjectIds: a text id is refused as malformed before the route looks anything up
const C1 = '64b64c1f1c1f1c1f1c1f1c11';
const harness = require('./helpers/createBooking');

const src = (...p) => path.join(__dirname, '..', '..', 'src', ...p);

// ---- chat unread per admin
test.describe('chat unread', () => {
  let server;
  let base;
  let threads;
  const token = (id) => jwt.sign({ id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const get = async (path_, as) => {
    const res = await fetch(`${base}/api/chat${path_}`, { headers: { Authorization: `Bearer ${token(as)}` } });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  test.before(async () => {
    User.findById = (id) => chain({ _id: id, role: id.startsWith('ADM') ? 'admin' : 'customer', isActive: true, name: id });
    Conversation.find = () => ({ sort: async () => threads });
    Conversation.findById = async (id) => threads.find((t) => String(t._id) === String(id)) || null;
    Conversation.updateOne = async (f, update) => {
      const t = threads.find((x) => x._id === f._id);
      Object.entries(update.$set).forEach(([key, value]) => {
        const [, adminId] = key.split('adminReadAtBy.');
        t.adminReadAtBy = t.adminReadAtBy || new Map();
        t.adminReadAtBy.set(adminId, value);
      });
    };
    const Message = require('../models/Message');
    Message.find = () => ({ sort: async () => [] });
    const app = express();
    app.use(express.json());
    app.use('/api/chat', require('../routes/chatRoutes'));
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.after(() => server && server.close());
  test.beforeEach(() => {
    authCache.clear();
    threads = [{ _id: C1, participantId: 'CUS1', participantRole: 'customer', lastMessageBySenderRole: 'customer', lastMessageAt: new Date('2026-10-01T10:00:00Z'), adminReadAt: null, toObject() { return { ...this }; } }];
  });

  test('a new customer message is unread for every admin', async () => {
    assert.equal((await get('/conversations', 'ADM1')).body[0].unread, true);
    assert.equal((await get('/conversations', 'ADM2')).body[0].unread, true);
  });

  test('one admin opening the thread does not hide it from the other', async () => {
    assert.equal((await get(`/conversations/${C1}/messages`, 'ADM1')).status, 200);
    assert.equal((await get('/conversations', 'ADM1')).body[0].unread, false, 'read for the admin who opened it');
    assert.equal((await get('/conversations', 'ADM2')).body[0].unread, true, 'still unread for the other admin');
  });

  test('a message that arrives after an admin read it is unread again for that admin only', async () => {
    await get(`/conversations/${C1}/messages`, 'ADM1');
    await get(`/conversations/${C1}/messages`, 'ADM2');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    threads[0].lastMessageAt = new Date();
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal((await get('/conversations', 'ADM1')).body[0].unread, true);
    assert.equal((await get('/conversations', 'ADM2')).body[0].unread, true);
    await get(`/conversations/${C1}/messages`, 'ADM2');
    assert.equal((await get('/conversations', 'ADM2')).body[0].unread, false);
    assert.equal((await get('/conversations', 'ADM1')).body[0].unread, true);
  });

  test('a thread read under the old shared time is not unread for everyone; the other admins read times are never sent', async () => {
    threads[0].adminReadAt = new Date('2026-10-02T00:00:00Z');
    assert.equal((await get('/conversations', 'ADM1')).body[0].unread, false);
    await get(`/conversations/${C1}/messages`, 'ADM2');
    const body = (await get('/conversations', 'ADM1')).body[0];
    assert.equal('adminReadAtBy' in body, false);
  });

  test('a message sent by an admin is never unread', async () => {
    threads[0].lastMessageBySenderRole = 'admin';
    assert.equal((await get('/conversations', 'ADM1')).body[0].unread, false);
  });
});

// ---- a discount cannot be approved on a finished or cancelled booking
test.describe('discount approval', () => {
  const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
  test.before(() => harness.install());
  test.after(() => harness.close());
  test.beforeEach(() => harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }],
    services: [cleaning],
  }));
  const approve = () => harness.call('PATCH', '/CZ-1/discount/approve', 'ADM1', {}, { role: 'admin' });
  const job = (status) => harness.addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status, units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 50, paymentStatus: 'Unpaid', discount: { type: 'Senior', status: 'Pending' } });

  test('refused on Completed and Cancelled, allowed on Pending and Approved', async () => {
    for (const status of ['Completed', 'Cancelled']) {
      harness.reset({ users: harness.state.users, services: harness.state.services });
      const booking = job(status);
      const res = await approve();
      assert.equal(res.status, 400, status);
      assert.equal(booking.discount.status, 'Pending');
    }
    for (const status of ['Pending', 'Approved']) {
      harness.reset({ users: harness.state.users, services: harness.state.services });
      harness.state.settings = { ...harness.DEFAULT_SETTINGS };
      job(status);
      const res = await approve();
      assert.equal(res.status, 200, `${status} ${JSON.stringify(res.body)}`);
    }
  });
});

// ---- Manila days, in several browser time zones
const run = (tz, script) => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${tz}: ${result.stderr}`);
  return result.stdout.trim();
};
const url = (...p) => require('node:url').pathToFileURL(src(...p)).href;
const ZONES = ['UTC', 'Asia/Manila', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

test('month buckets, report days and the earliest booking date are the same in every browser time zone', () => {
  const script = `
    import { manilaDateKey, dayKeyOf, earliestBookingKey, formatManilaDay, startOfManilaDay, endOfManilaDay } from '${url('utils', 'manilaTime.js')}';
    import { countPerMonth } from '${url('utils', 'monthBuckets.js')}';
    import { dateKeyOf, inRange } from '${url('utils', 'salesFigures.js')}';
    const bookings = [
      { createdAt: '2026-09-30T16:00:00Z' },   // 1 October 00:00 in Manila
      { createdAt: '2026-09-30T15:59:59Z' },   // 30 September 23:59:59 in Manila
      { createdAt: '2026-10-31T16:30:00Z' },   // 1 November, 00:30 in Manila
      { createdAt: '2026-10-15T04:00:00Z' },
      { createdAt: '2026-10-20T00:00:00Z', isBackJob: true },
    ];
    const months = countPerMonth(bookings, { fromKey: '2026-09-01', toKey: '2026-11-30', dateOf: (b) => b.createdAt, skip: (b) => !!b.isBackJob });
    const range = { fromKey: '2026-10-01', toKey: '2026-10-31', dateBasis: 'requested' };
    console.log(JSON.stringify({
      months: months.data, label: months.xLabel,
      keys: bookings.map((b) => dayKeyOf(b.createdAt)),
      inOctober: bookings.map((b) => inRange(b, range)),
      earliest: earliestBookingKey(3, new Date('2026-10-13T19:00:00Z')),
      earliest2: earliestBookingKey(3, new Date('2026-10-14T15:59:59Z')),
      shown: formatManilaDay('2026-10-14'), shownInstant: formatManilaDay('2026-10-13T16:00:00Z'),
      start: startOfManilaDay('2026-10-14').toISOString(), end: endOfManilaDay('2026-10-14').toISOString(),
      salesKey: dateKeyOf('2026-10-13T16:00:00Z'),
    }));
  `;
  const results = ZONES.map((tz) => ({ tz, out: run(tz, script) }));
  results.forEach((r) => assert.equal(r.out, results[0].out, `${r.tz} differs from ${results[0].tz}`));
  const out = JSON.parse(results[0].out);
  assert.deepEqual(out.months, [{ label: 'Sep', value: 1 }, { label: 'Oct', value: 2 }, { label: 'Nov', value: 1 }]);
  assert.deepEqual(out.keys, ['2026-10-01', '2026-09-30', '2026-11-01', '2026-10-15', '2026-10-20']);
  assert.deepEqual(out.inOctober, [true, false, false, true, true]);
  assert.equal(out.earliest, '2026-10-17', 'three days after the Manila 14th');
  assert.equal(out.earliest2, '2026-10-17');
  assert.equal(out.shown, 'Oct 14, 2026');
  assert.equal(out.shownInstant, 'Oct 14, 2026');
  assert.equal(out.start, '2026-10-13T16:00:00.000Z');
  assert.equal(out.end, '2026-10-14T15:59:59.999Z');
  assert.equal(out.salesKey, '2026-10-14');
});

test('a deleted customer is Unknown, not Residential', async () => {
  const { clientGroupOf } = await import(url('utils', 'clientGroup.js'));
  assert.equal(clientGroupOf(null), 'Unknown');
  assert.equal(clientGroupOf(undefined), 'Unknown');
  assert.equal(clientGroupOf({ clientType: 'Commercial' }), 'Commercial');
  assert.equal(clientGroupOf({}), 'Residential', 'an old account with no type is Residential');
  const { clientTypeOf, matchesClientType } = await import(url('utils', 'salesFigures.js'));
  assert.equal(clientTypeOf({ customer: null }), 'Unknown');
  assert.equal(matchesClientType({ customer: null }, 'Residential'), false);
  assert.equal(matchesClientType({ customer: null }, 'Unknown'), true);
  assert.equal(matchesClientType({ customer: null }, 'all'), true);
});

test('the dashboard shows an error with Retry, leaves back job visits out of Total Bookings, and counts them on their own', () => {
  const code = fs.readFileSync(src('pages', 'admin', 'dashboard.jsx'), 'utf8');
  assert.doesNotMatch(code, /orFallback/);
  assert.match(code, /<LoadError message="Could not load the dashboard\." onRetry=\{fetchData\} \/>/);
  assert.match(code, /setFailed\(true\)/);
  assert.match(code, /title: 'Total Bookings',\s*value: filteredBookings\.filter\(\(b\) => !b\.isBackJob\)\.length/);
  assert.match(code, /title: 'Back Job Visits',\s*value: filteredBookings\.filter\(\(b\) => b\.isBackJob\)\.length/);
  assert.match(code, /clientGroupOf\(b\.customer\) === activeClientType/);
});

test('Service Request Analytics leaves back job visits out of its response time and request counts', () => {
  const code = fs.readFileSync(src('pages', 'admin', 'analytics.jsx'), 'utf8');
  assert.match(code, /const requestBookings = useMemo\(\(\) => filteredBookings\.filter\(\(b\) => !b\.isBackJob\)/);
  assert.match(code, /computeAvgResponseHours\(requestBookings\)/);
});

test('no admin or customer date check reads the browser clock for "today"', () => {
  const book = fs.readFileSync(src('pages', 'customer', 'book_service.jsx'), 'utf8');
  assert.match(book, /bookingWindow\(\)/);
  assert.match(book, /bookingDateProblem\(form\.date\)/);
  assert.doesNotMatch(book, /minDate\.setDate/);
  const reports = fs.readFileSync(src('pages', 'admin', 'reports.jsx'), 'utf8');
  assert.match(reports, /manilaTodayKey\(\)/);
  const statement = fs.readFileSync(src('components', 'statement_of_account.jsx'), 'utf8');
  assert.match(statement, /manilaTodayKey\(\)/);
});
