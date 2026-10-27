// Run with: npm test (inside server/). E17-7: the "Email notification" card. The route returns the most recent email about a booking for the person
// looking, with a masked address and no content, and every state has its words. A customer sees only their own booking's emails; the admin also
// sees the delivery status and a short failure code, never SMTP details. No database; the delivery and notification stores are stand-ins.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const harness = require('./helpers/createBooking');
const { startSsrServer } = require('./helpers/viteSsr');
const EmailDelivery = require('../models/EmailDelivery');
const Notification = require('../models/Notification');
const { maskEmail, failureCode, emailCard } = require('../utils/emailStatus');
const { chain } = require('./helpers/memoryQueries');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const people = () => [
  { _id: 'CUS1', role: 'customer', isActive: true, name: 'Customer One', email: 'jane.doe@gmail.com' },
  { _id: 'CUS2', role: 'customer', isActive: true, name: 'Customer Two', email: 'other.person@gmail.com' },
  { _id: 'CUS3', role: 'customer', isActive: true, name: 'No Email' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin', email: 'admin@example.com' },
  { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech One', position: 'Technician', email: 'tech.one@example.com' },
  { _id: 'STF2', role: 'staff', isActive: true, name: 'Tech Two', position: 'Technician', email: 'tech.two@example.com' },
];

let deliveries = [];
let vite;
let closeVite;
const savedEnv = {};

before(async () => {
  harness.install();
  ({ vite, close: closeVite } = await startSsrServer());
  Notification.find = (filter) => chain(state.notes.filter((n) => n.relatedBookingId === filter.relatedBookingId && n.user === filter.user).map((n) => ({ ...n, _id: n._id || `${n.user}-${n.type}` })));
  EmailDelivery.find = (filter) => {
    const ids = new Set(filter.notification.$in);
    const rows = deliveries.filter((d) => ids.has(d.notification)).sort((a, b) => b.createdAt - a.createdAt);
    return { sort() { return this; }, limit(n) { return { select() { return Promise.resolve(rows.slice(0, n)); } }; } };
  };
});
after(async () => { await harness.close(); await closeVite(); });

test.beforeEach(() => {
  harness.reset({ users: people(), services: [cleaning] });
  deliveries = [];
  ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT'].forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_FROM = 'CZAMS <noreply@example.test>';
  addBooking({
    bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Approved', units: [{ type: 'Split Type', quantity: 1 }], date: goodDate(9), time: 'Morning',
    assignments: [{ lead: 'STF1', helper: null }],
  });
});
test.afterEach(() => { Object.entries(savedEnv).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; }); });

// a notification about the booking for `user`, and an email delivery for it
const email = (user, over = {}, noteType = 'booking_approved') => {
  const note = { _id: `${user}-${noteType}-${deliveries.length}`, user, type: noteType, message: 'secret message body', relatedBookingId: 'CZ-1' };
  state.notes.push(note);
  const to = { CUS1: 'jane.doe@gmail.com', CUS2: 'other.person@gmail.com', STF1: 'tech.one@example.com' }[user];
  deliveries.push({
    notification: note._id, recipientEmail: to, subject: 'CZAMS: Booking Approved', text: 'the full text', html: '<p>the html</p>', status: 'pending', attempts: 0,
    createdAt: new Date(Date.now() - 1000 * (10 - deliveries.length)), ...over,
  });
};
const asAdmin = { role: 'admin' };
const asStaff = { role: 'staff' };
const status = (as = 'CUS1', opts) => call('GET', '/CZ-1/email-status', as, undefined, opts);

test('masking: first letter, three stars, the domain', () => {
  assert.equal(maskEmail('jane.doe@gmail.com'), 'j***@gmail.com');
  assert.equal(maskEmail('a@b.co'), 'a***@b.co');
  assert.equal(maskEmail('no-at-sign'), '');
  assert.equal(maskEmail('@gmail.com'), '');
  assert.equal(maskEmail(undefined), '');
});

test('Sent: "sent" with the date and the masked address, never the full address', async () => {
  email('CUS1', { status: 'sent', sentAt: new Date('2026-10-22T03:00:00Z') });
  const res = await status();
  assert.equal(res.status, 200);
  assert.equal(res.body.state, 'sent');
  assert.equal(res.body.maskedTo, 'j***@gmail.com');
  assert.ok(res.body.at);
  assert.equal(JSON.stringify(res.body).includes('jane.doe'), false);
});

test('Queued: pending and processing both read as "will be sent shortly"', async () => {
  email('CUS1', { status: 'pending' });
  assert.equal((await status()).body.state, 'queued');
  deliveries[0].status = 'processing';
  assert.equal((await status()).body.state, 'queued');
});

test('Failed: the customer is told in plain words, with no error text, status code or SMTP detail', async () => {
  email('CUS1', { status: 'failed', attempts: 5, lastError: '535 5.7.8 Authentication failed for smtp-user@relay.example (pass=hunter2)' });
  const res = await status();
  assert.equal(res.body.state, 'failed');
  const dump = JSON.stringify(res.body);
  for (const leak of ['535', 'Authentication', 'smtp-user', 'hunter2', 'relay.example', 'attempts', 'failureCode', 'subject', 'the full text']) assert.equal(dump.includes(leak), false, leak);
});

test('None: no email yet; and no address on the account', async () => {
  assert.equal((await status()).body.state, 'none');
  harness.reset({ users: people(), services: [cleaning] });
  addBooking({ bookingId: 'CZ-1', customer: 'CUS3', service: cleaning, status: 'Pending', units: [{ type: 'Split Type', quantity: 1 }], date: goodDate(9), time: 'Morning' });
  assert.equal((await status('CUS3')).body.state, 'noAddress');
});

test('only the most recent email is shown', async () => {
  email('CUS1', { status: 'failed', lastError: 'x', createdAt: new Date(Date.now() - 50000) });
  email('CUS1', { status: 'sent', sentAt: new Date(), createdAt: new Date() }, 'booking_cancelled');
  assert.equal((await status()).body.state, 'sent');
});

test('privacy: another customer gets 404, and sees nothing of this booking', async () => {
  email('CUS1', { status: 'sent', sentAt: new Date() });
  const other = await status('CUS2');
  assert.equal(other.status, 404);
  assert.equal(JSON.stringify(other.body).includes('gmail'), false);
  assert.equal((await call('GET', '/CZ-NOPE/email-status', 'CUS1')).status, 404);
});

test("privacy: a customer never sees another person's email about the same booking", async () => {
  email('STF1', { status: 'sent', sentAt: new Date() }, 'job_assigned');
  const res = await status('CUS1');
  assert.equal(res.body.state, 'none', "the technician's email is not the customer's");
  assert.equal(JSON.stringify(res.body).includes('tech.one'), false);
});

test('admin: the same card plus the delivery status and a short failure code, and still no SMTP detail', async () => {
  email('CUS1', { status: 'failed', attempts: 5, lastError: 'Invalid login: 535 Authentication failed for smtp-user@relay.example' });
  const res = await status('ADM1', asAdmin);
  assert.equal(res.status, 200);
  assert.equal(res.body.state, 'failed');
  assert.equal(res.body.status, 'failed');
  assert.equal(res.body.attempts, 5);
  assert.equal(res.body.failureCode, 'AUTH_FAILED');
  assert.equal(res.body.maskedTo, 'j***@gmail.com', 'the admin sees the customer\'s email, masked too');
  for (const leak of ['smtp-user', 'relay.example', 'Authentication failed', 'jane.doe']) assert.equal(JSON.stringify(res.body).includes(leak), false, leak);
});

test('failure codes: authentication, connection, recipient, not configured, anything else', () => {
  assert.equal(failureCode('Invalid login: 535 Authentication failed'), 'AUTH_FAILED');
  assert.equal(failureCode('connect ECONNREFUSED 10.0.0.1:587'), 'CONNECTION_FAILED');
  assert.equal(failureCode('getaddrinfo ENOTFOUND smtp.example.test'), 'CONNECTION_FAILED');
  assert.equal(failureCode('550 5.1.1 Mailbox unavailable'), 'RECIPIENT_REFUSED');
  assert.equal(failureCode('SMTP email settings are incomplete.'), 'NOT_CONFIGURED');
  assert.equal(failureCode('something odd'), 'SEND_FAILED');
  assert.equal(failureCode(''), 'UNKNOWN');
});

test('not configured: the admin is told email is not set up; the customer just sees "No email sent yet"', async () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  const admin = await status('ADM1', asAdmin);
  assert.equal(admin.body.state, 'notConfigured');
  assert.equal(admin.body.configured, false);
  const customer = await status();
  assert.equal(customer.body.state, 'none');
  assert.equal('configured' in customer.body, false, 'the customer is not told about the server setup');
});

test('a technician sees their own job email on a booking they are on, and 404 on one they are not', async () => {
  email('STF1', { status: 'sent', sentAt: new Date() }, 'job_assigned');
  const mine = await status('STF1', asStaff);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.state, 'sent');
  assert.equal(mine.body.maskedTo, 't***@example.com');
  assert.equal((await status('STF2', asStaff)).status, 404);
});

test('the card data on its own', () => {
  assert.deepEqual(emailCard({ delivery: null, configured: true, hasEmail: false }), { state: 'noAddress' });
  assert.deepEqual(emailCard({ delivery: null, configured: true, hasEmail: true }), { state: 'none' });
  assert.deepEqual(emailCard({ delivery: null, configured: false, hasEmail: true }), { state: 'none' });
  assert.deepEqual(emailCard({ delivery: null, configured: false, hasEmail: true, admin: true }), { state: 'notConfigured' });
});

test('the words: every state, for the customer and for the admin', async () => {
  const { emailCardText, FAILED_TEXT } = await vite.ssrLoadModule('/src/utils/emailCardText.js');
  const fmt = () => 'Oct 22, 2026, 11:00 AM';
  assert.deepEqual(emailCardText({ state: 'sent', at: '2026-10-22', maskedTo: 'j***@gmail.com' }, { formatDate: fmt }), { title: 'Email sent', lines: ['Oct 22, 2026, 11:00 AM', 'To j***@gmail.com'] });
  assert.equal(emailCardText({ state: 'queued' }).title, 'Email will be sent shortly');
  assert.equal(FAILED_TEXT, 'We could not send the email. You can still see updates in the app.');
  assert.equal(emailCardText({ state: 'failed' }).title, FAILED_TEXT);
  assert.equal(emailCardText({ state: 'none' }).title, 'No email sent yet');
  assert.equal(emailCardText({ state: 'noAddress' }).title, 'No email address on your account');
  assert.equal(emailCardText({ state: 'notConfigured' }, { admin: true }).title, 'Email notifications are not set up');
  assert.equal(emailCardText({ state: 'notConfigured' }).title, 'No email sent yet');
  const admin = emailCardText({ state: 'failed', status: 'failed', failureCode: 'AUTH_FAILED' }, { admin: true });
  assert.deepEqual(admin.lines, ['Delivery status: failed', 'Reason code: AUTH_FAILED']);
  assert.deepEqual(emailCardText({ state: 'failed', status: 'failed', failureCode: 'AUTH_FAILED' }).lines, [], 'the customer gets no code');
});

test('the card renders in the style of the in-app card', async () => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const { EmailStatusView } = await vite.ssrLoadModule('/src/components/email_status_card.jsx');
  const html = renderToStaticMarkup(React.createElement(EmailStatusView, { card: { state: 'sent', at: '2026-10-22T03:00:00Z', maskedTo: 'j***@gmail.com' } }));
  assert.match(html, /confirmation-notif-card/);
  assert.match(html, /Email notification/);
  assert.match(html, /Email sent/);
  assert.match(html, /j\*\*\*@gmail\.com/);
  assert.doesNotMatch(html, /Delivery status/);
});
