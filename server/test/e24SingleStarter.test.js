// Run with: npm test (inside server/). E24: exactly one piece of code starts an Approved booking on its service day (startApprovedBookings in
// utils/bookingLifecycle.js). The old 10 minute job that did this at the start of the time block, and emailed the customer, is gone. However many
// runs overlap (the midnight run, the hourly run, the start-up run, the admin's manual route), a booking gets ONE audit entry, ONE in-app note per
// technician, no notice for the customer and no email. A fixed clock; the real functions run, only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cron = require('node-cron');
const harness = require('./helpers/createBooking');
const EmailDelivery = require('../models/EmailDelivery');
const { startApprovedBookings, runDayStart } = require('../utils/bookingLifecycle');
const Booking = require('../models/Booking');
const { chain } = require('./helpers/memoryQueries');
const { runBookingStatusCheck, startBookingStatusSchedule } = require('../jobs/bookingStatusJob');

const { state, call, addBooking } = harness;

const NOW = new Date('2026-11-10T16:30:00Z'); // 2026-11-11 00:30 in Manila: the service day has just started
const TODAY = '2026-11-11';
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const approved = (id, over = {}) => addBooking({
  bookingId: id, customer: 'CUS1', service: cleaning, status: 'Approved', date: TODAY, time: 'Afternoon', units: [{ type: 'Split Type', quantity: 1 }],
  downPaymentPercent: 50, paymentStatus: 'partially_paid', downPaymentPaidAmount: 500, refund: { status: 'None' }, assignments: [{ lead: 'TECH1', helper: 'TECH2' }],
  createdAt: '2026-11-01T02:00:00Z', ...over,
});
const starts = () => state.audits.filter((a) => a.action === 'booking.start');
const notesOf = (user) => state.notes.filter((n) => n.user === user && n.type === 'booking_in_progress');

let emails;
const realEmailCreate = EmailDelivery.create;
test.before(() => harness.install());
test.after(() => { EmailDelivery.create = realEmailCreate; harness.close(); });
test.beforeEach(() => {
  harness.reset({
    users: [
      { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer', email: 'cust@example.test' },
      { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
      { _id: 'TECH1', role: 'technician', isActive: true, name: 'Tech One', email: 'one@example.test' },
      { _id: 'TECH2', role: 'technician', isActive: true, name: 'Tech Two', email: 'two@example.test' },
    ],
    services: [cleaning],
  });
  emails = [];
  EmailDelivery.create = async (doc) => { emails.push(doc); return doc; };
});

test('the old 10 minute block-start job does not exist: the only schedules are midnight and hourly, and nothing is scheduled every 10 minutes', async () => {
  const realSchedule = cron.schedule;
  const scheduled = [];
  cron.schedule = (expression) => { scheduled.push(expression); return { stop() {} }; };
  try {
    startBookingStatusSchedule();
  } finally {
    cron.schedule = realSchedule;
  }
  assert.deepEqual(scheduled, ['5 0 * * *', '20 * * * *']);
  assert.equal(scheduled.some((e) => e.startsWith('*/10')), false);
  const job = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'bookingStatusJob.js'), 'utf8');
  assert.equal(/blockStartInstant|findOneAndUpdate|Booking\./.test(job), false, 'the job file only schedules; it never writes a booking itself');
});

test('only startApprovedBookings writes Approved to In Progress, anywhere in the server code', () => {
  const root = path.join(__dirname, '..');
  const hits = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (['node_modules', 'test', 'scripts', 'uploads', 'storage'].includes(entry.name)) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); return; }
    if (!entry.name.endsWith('.js')) return;
    fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (/\$set[^\n]*status:\s*BOOKING_STATUS\.IN_PROGRESS|status\s*=\s*BOOKING_STATUS\.IN_PROGRESS/.test(line)) hits.push(`${path.relative(root, full).replace(/\\/g, '/')}:${i + 1}`);
    });
  });
  walk(root);
  const places = hits.map((h) => h.split(':')[0]).sort();
  // utils/bookingLifecycle.js starts a booking; routes/reportRoutes.js only puts a Completed booking back when its report is deleted (not a start)
  assert.deepEqual(places, ['routes/reportRoutes.js', 'utils/bookingLifecycle.js']);
});

test('an Approved booking is started once, whichever way the start runs overlap', async () => {
  approved('CZ-1');
  // the midnight run, the hourly run, the start-up run and the manual route at the same moment
  const results = await Promise.all([
    runBookingStatusCheck(NOW),
    runBookingStatusCheck(NOW),
    runDayStart({ now: NOW }),
    startApprovedBookings({ now: NOW }),
  ]);
  const moved = results.reduce((sum, r) => sum + (r.start ? r.start.started : r.started), 0);
  assert.equal(moved, 1, 'exactly one of the overlapping runs moved it');
  assert.equal(state.bookings[0].status, 'In Progress');
  assert.equal(starts().length, 1, 'one audit entry');
  assert.equal(starts()[0].actor.role, 'system');
  assert.equal(notesOf('TECH1').length, 1);
  assert.equal(notesOf('TECH2').length, 1);
});

test('two runs that both read the booking as Approved before either writes still start it once (the conditional update decides)', async () => {
  const b = approved('CZ-1');
  const realFind = Booking.find;
  // every run reads the same snapshot of the Approved bookings, as two processes that look at the same moment would
  const snapshot = JSON.parse(JSON.stringify([b]));
  Booking.find = (filter) => (filter && filter.status === 'Approved' ? chain(snapshot.map((x) => ({ ...x }))) : realFind(filter));
  try {
    const [one, two, three] = await Promise.all([startApprovedBookings({ now: NOW }), startApprovedBookings({ now: NOW }), runBookingStatusCheck(NOW)]);
    assert.equal(one.matched + two.matched + three.matched, 3, 'all three runs saw it as Approved');
    assert.equal(one.started + two.started + three.start.started, 1, 'only the first write won');
  } finally {
    Booking.find = realFind;
  }
  assert.equal(starts().length, 1, 'one audit entry');
  assert.equal(notesOf('TECH1').length, 1);
  assert.equal(notesOf('TECH2').length, 1);
  assert.equal(emails.length, 0);
});

test('the customer gets no notice and no email, and nobody gets an email: only the technicians get an in-app note', async () => {
  approved('CZ-1');
  await Promise.all([runBookingStatusCheck(NOW), startApprovedBookings({ now: NOW })]);
  await runBookingStatusCheck(NOW);
  assert.equal(notesOf('CUS1').length, 0, 'no in-app notice for the customer');
  assert.equal(notesOf('ADM1').length, 0);
  assert.equal(emails.length, 0, 'no email was queued for anyone');
  assert.equal(state.notes.filter((n) => n.type === 'booking_in_progress').length, 2, 'two technician notes in all');
});

test('the admin manual route runs the same single starter: a second press changes nothing and adds nothing', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  approved('CZ-1');
  const first = await call('POST', '/status-check/run', 'ADM1', {}, { role: 'admin' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.modified, first.body.start.started, 'the old answer names are kept');
  const second = await call('POST', '/status-check/run', 'ADM1', {}, { role: 'admin' });
  assert.equal(second.body.modified, 0);
  assert.equal(state.bookings[0].status, 'In Progress');
  assert.equal(starts().length, 1, 'exactly one audit entry for the one start');
  assert.equal(emails.length, 0);
});

test('a technician or customer cannot press the manual route', async () => {
  approved('CZ-1');
  assert.equal((await call('POST', '/status-check/run', 'CUS1', {}, { role: 'customer' })).status, 403);
  assert.equal((await call('POST', '/status-check/run', 'TECH1', {}, { role: 'technician' })).status, 403);
  assert.equal(state.bookings[0].status, 'Approved');
});

test('a booking rescheduled after a no show is started again on its new day, with its own audit entry, never twice for one day', async () => {
  const b = approved('CZ-1');
  await startApprovedBookings({ now: NOW });
  assert.equal(starts().length, 1);
  // the admin moved it (no show, no charge): Approved again on a later day
  b.status = 'Approved';
  b.date = '2026-11-17';
  b.startedBySystem = false;
  await Promise.all([startApprovedBookings({ now: NOW }), startApprovedBookings({ now: NOW })]);
  assert.equal(b.status, 'Approved', 'not started before its new day');
  const later = new Date('2026-11-16T16:30:00Z'); // 2026-11-17 00:30 Manila
  await Promise.all([startApprovedBookings({ now: later }), startApprovedBookings({ now: later })]);
  assert.equal(b.status, 'In Progress');
  assert.equal(starts().length, 2, 'one entry for each real start, none duplicated');
});
