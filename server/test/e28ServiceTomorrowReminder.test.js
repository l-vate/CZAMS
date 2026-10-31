// Run with: npm test (inside server/). E28: the "Your service is tomorrow" reminder. An Approved booking whose booked day is tomorrow (Asia/Manila)
// reminds its customer (in-app and email) and its technicians (in-app only), once per booked date, from the reminder hour on. Every rule runs with
// a fixed "now" (no weekday, no real clock). The real functions run; only the database is replaced, and the email queue is a stub (no mail is sent).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/createBooking');
const { startSsrServer } = require('./helpers/viteSsr');
const EmailDelivery = require('../models/EmailDelivery');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const settings = require('../constants/serviceTomorrowReminder');
const { runServiceTomorrowReminders, customerMessage, blockText } = require('../utils/serviceTomorrowReminder');

const { state, addBooking } = harness;

// Manila is UTC+8. The service day is 2026-11-11, so "tomorrow" is that date on 2026-11-10 (Manila).
const TOMORROW = '2026-11-11';
const BEFORE_HOUR = new Date('2026-11-09T23:30:00Z'); // 07:30 on 2026-11-10 in Manila: before the reminder hour (8)
const AT_HOUR = new Date('2026-11-10T00:00:00Z'); // 08:00 on 2026-11-10
const MID_DAY = new Date('2026-11-10T04:00:00Z'); // 12:00
const LATE_NIGHT = new Date('2026-11-10T14:30:00Z'); // 22:30 on 2026-11-10
const SERVICE_DAY = new Date('2026-11-10T16:30:00Z'); // 00:30 on 2026-11-11: the service day has started

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const make = (id, over = {}) => addBooking({
  bookingId: id, customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 1 }], date: TOMORROW, time: 'Morning',
  address: '12 Sample Street, Quezon City', downPaymentPercent: 50, paymentStatus: 'partially_paid', balancePaymentStatus: 'None', refund: { status: 'None' },
  assignments: [{ lead: 'TECH1', helper: 'TECH2' }], ...over,
});
const byId = (id) => state.bookings.find((b) => b.bookingId === id);
const notes = (type) => state.notes.filter((n) => n.type === type);

const mail = [];
const realCreate = EmailDelivery.create;
const savedEnv = {};
const ENV = { SMTP_HOST: 'smtp.example.test', SMTP_FROM: 'noreply@example.test', APP_URL: 'https://app.example.test' };

test.before(() => {
  harness.install();
  EmailDelivery.create = async (doc) => { mail.push(doc); return doc; }; // the queue only: no message is ever handed to a mail server
  Object.keys(ENV).forEach((k) => { savedEnv[k] = process.env[k]; process.env[k] = ENV[k]; });
});
test.after(() => {
  EmailDelivery.create = realCreate;
  Object.keys(ENV).forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; });
  harness.close();
});
test.beforeEach(() => {
  mail.length = 0;
  harness.reset({
    users: [
      { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer One', email: 'cus1@example.test' },
      { _id: 'TECH1', role: 'technician', isActive: true, name: 'Tech One', email: 'tech1@example.test' },
      { _id: 'TECH2', role: 'technician', isActive: true, name: 'Tech Two', email: 'tech2@example.test' },
    ],
    services: [cleaning],
  });
});

test('an Approved booking for tomorrow is reminded from the reminder hour on, and not before', async () => {
  make('CZ-1');
  const early = await runServiceTomorrowReminders({ now: BEFORE_HOUR });
  assert.equal(early.reminded, 0);
  assert.equal(notes(NOTIFICATION_TYPE.BOOKING_TOMORROW_REMINDER).length, 0);
  const result = await runServiceTomorrowReminders({ now: AT_HOUR });
  assert.equal(result.reminded, 1);
  assert.equal(result.customersNotified, 1);
  assert.equal(result.techniciansNotified, 2);
  assert.equal(byId('CZ-1').serviceReminderSentFor, TOMORROW);
  assert.equal(settings.SERVICE_TOMORROW_REMINDER_HOUR, 8);
});

test('the reminder is sent once, across repeated runs and across two runs at the same moment', async () => {
  make('CZ-1');
  await runServiceTomorrowReminders({ now: AT_HOUR });
  await runServiceTomorrowReminders({ now: MID_DAY });
  await runServiceTomorrowReminders({ now: LATE_NIGHT });
  assert.equal(notes(NOTIFICATION_TYPE.BOOKING_TOMORROW_REMINDER).length, 1);
  assert.equal(notes(NOTIFICATION_TYPE.JOB_TOMORROW_REMINDER).length, 2);
  state.notes.length = 0;
  state.bookings.length = 0;
  make('CZ-2');
  const [a, b] = await Promise.all([runServiceTomorrowReminders({ now: AT_HOUR }), runServiceTomorrowReminders({ now: AT_HOUR })]);
  assert.equal(a.reminded + b.reminded, 1, 'only one of the two runs sent it');
  assert.equal(notes(NOTIFICATION_TYPE.BOOKING_TOMORROW_REMINDER).length, 1);
});

test('only Approved bookings for tomorrow get one: not today, two days ahead, Pending, In Progress, Completed, Cancelled, expired or with a no-show report', async () => {
  make('CZ-TODAY', { date: '2026-11-10' });
  make('CZ-LATER', { date: '2026-11-12' });
  make('CZ-PENDING', { status: 'Pending' });
  make('CZ-PROGRESS', { status: 'In Progress' });
  make('CZ-DONE', { status: 'Completed' });
  make('CZ-CANCELLED', { status: 'Cancelled' });
  make('CZ-EXPIRED', { status: 'Cancelled', expiredBySystem: true });
  make('CZ-NOSHOW', { noShow: { status: 'Reported' } });
  make('CZ-NOSHOW-OK', { noShow: { status: 'None' } });
  const result = await runServiceTomorrowReminders({ now: MID_DAY });
  assert.equal(result.reminded, 1, 'only the one booking with no no-show report');
  assert.equal(byId('CZ-NOSHOW-OK').serviceReminderSentFor, TOMORROW);
  for (const id of ['CZ-TODAY', 'CZ-LATER', 'CZ-PENDING', 'CZ-PROGRESS', 'CZ-DONE', 'CZ-CANCELLED', 'CZ-EXPIRED', 'CZ-NOSHOW']) {
    assert.ok(!byId(id).serviceReminderSentFor, `${id} was not reminded`);
  }
});

test('once the service day has started nothing is sent for it, even if the reminder was missed', async () => {
  make('CZ-1');
  const result = await runServiceTomorrowReminders({ now: SERVICE_DAY });
  assert.equal(result.reminded, 0);
  assert.equal(notes(NOTIFICATION_TYPE.BOOKING_TOMORROW_REMINDER).length, 0);
});

test('a reschedule to a new date is reminded again, for the new date only', async () => {
  make('CZ-1');
  await runServiceTomorrowReminders({ now: AT_HOUR });
  byId('CZ-1').date = '2026-11-13'; // the admin or the customer moved it (the date field is what a reschedule changes)
  const early = await runServiceTomorrowReminders({ now: MID_DAY });
  assert.equal(early.reminded, 0, 'the new date is not tomorrow yet');
  const next = await runServiceTomorrowReminders({ now: new Date('2026-11-12T02:00:00Z') });
  assert.equal(next.reminded, 1);
  assert.equal(byId('CZ-1').serviceReminderSentFor, '2026-11-13');
  const messages = notes(NOTIFICATION_TYPE.BOOKING_TOMORROW_REMINDER).map((n) => n.message);
  assert.equal(messages.length, 2);
  assert.match(messages[1], /Friday, November 13, 2026/);
});

test('a booking approved after the reminder hour is reminded at the next run', async () => {
  const first = await runServiceTomorrowReminders({ now: MID_DAY });
  assert.equal(first.reminded, 0);
  make('CZ-LATE'); // approved in the evening
  const next = await runServiceTomorrowReminders({ now: LATE_NIGHT });
  assert.equal(next.reminded, 1);
});

test('the customer gets the in-app note and the email with the booking link; the technicians get an in-app note only', async () => {
  make('CZ-1');
  await runServiceTomorrowReminders({ now: AT_HOUR });
  const [mine] = notes(NOTIFICATION_TYPE.BOOKING_TOMORROW_REMINDER);
  assert.equal(mine.user, 'CUS1');
  assert.equal(mine.relatedBookingId, 'CZ-1');
  assert.match(mine.message, /^Your service is tomorrow\. Cleaning is booked for Wednesday, November 11, 2026, Morning \(8:00 AM to 12:00 PM\), at 12 Sample Street, Quezon City\./);
  assert.match(mine.message, /Our technicians: Tech One, Tech Two\./);
  assert.match(mine.message, /Please make sure someone can let them in\. If you need to change anything, open your booking\./);
  assert.doesNotMatch(mine.message, /₱/, 'no amount when nothing is due');
  const jobs = notes(NOTIFICATION_TYPE.JOB_TOMORROW_REMINDER);
  assert.deepEqual(jobs.map((n) => n.user).sort(), ['TECH1', 'TECH2']);
  assert.match(jobs[0].message, /^Job tomorrow: Cleaning, Wednesday, November 11, 2026, Morning \(8:00 AM to 12:00 PM\), at 12 Sample Street, Quezon City\.$/);
  assert.equal(mail.length, 1, 'one email, to the customer');
  assert.equal(mail[0].recipientEmail, 'cus1@example.test');
  assert.match(mail[0].html, /Your service is tomorrow/);
  assert.match(mail[0].html, /https:\/\/app\.example\.test\/customer\/book_details\/CZ-1/, 'a link to the booking');
  assert.ok(!mail.some((m) => /tech/.test(m.recipientEmail)), 'no email to a technician');
  assert.doesNotMatch(mail[0].text, /—/, 'no em dash');
});

test('an unassigned booking still reminds the customer, and the message has no technician line', async () => {
  make('CZ-1', { assignments: [] });
  const result = await runServiceTomorrowReminders({ now: AT_HOUR });
  assert.equal(result.customersNotified, 1);
  assert.equal(result.techniciansNotified, 0);
  const [mine] = notes(NOTIFICATION_TYPE.BOOKING_TOMORROW_REMINDER);
  assert.doesNotMatch(mine.message, /Our technicians/);
});

test('a balance is mentioned only when it is already due', () => {
  const base = { service: { name: 'Cleaning' }, date: TOMORROW, time: 'Afternoon', address: 'A St', units: [{ type: 'Split Type', quantity: 1 }], downPaymentPercent: 50 };
  const none = customerMessage({ ...base, status: 'Approved', paymentStatus: 'partially_paid' }, []);
  assert.doesNotMatch(none, /due\./);
  assert.match(none, /Afternoon \(1:00 PM to 6:00 PM\)/);
  const owed = customerMessage({ ...base, status: 'Approved', paymentStatus: 'Unpaid' }, []);
  assert.match(owed, /Your down payment of ₱[\d,.]+ is due\./, 'an open down payment is the existing due amount, not a new calculation');
});

test('a dry run counts and writes nothing; a switched off job does nothing', async () => {
  make('CZ-1');
  const dry = await runServiceTomorrowReminders({ now: AT_HOUR, dryRun: true });
  assert.equal(dry.matched, 1);
  assert.equal(dry.reminded, 0);
  assert.equal(state.notes.length, 0);
  assert.ok(!byId('CZ-1').serviceReminderSentFor);
  const off = await runServiceTomorrowReminders({ now: AT_HOUR, enabled: false });
  assert.equal(off.matched, 0);
  assert.equal(state.notes.length, 0);
});

test('the reminder never changes the booking, a payment or a refund, and a failed send gives the claim back', async () => {
  make('CZ-1');
  const before = JSON.parse(JSON.stringify(byId('CZ-1')));
  await runServiceTomorrowReminders({ now: AT_HOUR });
  const after = JSON.parse(JSON.stringify(byId('CZ-1')));
  delete after.serviceReminderSentFor;
  delete after.serviceReminderSentAt;
  assert.deepEqual(after, before, 'only the sent-for date and time were written');
  assert.equal(state.bookings.length, 1, 'nothing was created');
  // a technician note that fails: the claim is given back, so the next run tries again
  state.bookings.length = 0;
  state.notes.length = 0;
  make('CZ-2');
  const Notification = require('../models/Notification');
  const original = Notification.create;
  Notification.create = async () => { throw new Error('write failed'); };
  const failed = await runServiceTomorrowReminders({ now: AT_HOUR });
  Notification.create = original;
  assert.equal(failed.failed, 1);
  assert.ok(!byId('CZ-2').serviceReminderSentFor, 'the claim was given back');
  const retried = await runServiceTomorrowReminders({ now: MID_DAY });
  assert.equal(retried.reminded, 1);
});

test('pages of bookings are all reminded', async () => {
  for (let i = 1; i <= 5; i += 1) make(`CZ-${i}`);
  const result = await runServiceTomorrowReminders({ now: AT_HOUR, batch: 2 });
  assert.equal(result.reminded, 5);
  assert.equal(result.matched, 5);
});

test('the new kinds are in a category each, and the 3 month "book again" reminder is not reused and not changed', async () => {
  const { vite, close } = await startSsrServer();
  const cats = await vite.ssrLoadModule('/src/constants/notificationCategories.js');
  await close();
  assert.equal(cats.categoryOf('booking_tomorrow_reminder'), 'bookings');
  assert.equal(cats.categoryOf('job_tomorrow_reminder'), 'jobs');
  assert.equal(cats.categoryOf('service_reminder'), 'bookings');
  const util = fs.readFileSync(path.join(__dirname, '..', 'utils', 'serviceTomorrowReminder.js'), 'utf8');
  assert.doesNotMatch(util, /SERVICE_REMINDER/, 'the new job does not use the 3 month kind');
  const old = require('../jobs/serviceReminderJob');
  assert.equal(old.SERVICE_REMINDER_TRIGGER_MONTHS, 3);
  const oldSource = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'serviceReminderJob.js'), 'utf8');
  assert.match(oldSource, /cron\.schedule\('0 0 \* \* \*', safeRunDaily, \{ timezone: TIMEZONE \}\);/);
  assert.match(oldSource, /NOTIFICATION_TYPE\.SERVICE_REMINDER,/);
});

test('the block text and the schedule', () => {
  assert.equal(blockText('Morning'), 'Morning (8:00 AM to 12:00 PM)');
  assert.equal(blockText('Afternoon'), 'Afternoon (1:00 PM to 6:00 PM)');
  assert.equal(settings.SERVICE_TOMORROW_REMINDER_SCHEDULE, '35 * * * *');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /startServiceTomorrowReminderSchedule\(\);/);
});
