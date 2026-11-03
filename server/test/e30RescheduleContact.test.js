// Run with: npm test (inside server/). A customer can change the contact name and number while rescheduling. The change belongs to that
// booking only (never the customer's account): a Pending booking takes it at once, an Approved one only when the admin approves the
// reschedule. No reschedule rule changes. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');
const { contactInputProblem, contactChange, contactChangeSentence } = require('../utils/rescheduleContact');

const { state, call, addBooking, goodDate } = harness;
const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 1000, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, name: 'Ana Reyes', phone: '09170000001' },
  { _id: 'CUS2', role: 'customer', isActive: true, name: 'Ben Santos', phone: '09170000002' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
];
const asAdmin = { role: 'admin' };
const NEW_DAY = () => goodDate(14);

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({ users, services: [cleaning] }));

const book = (over = {}) => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Pending', date: goodDate(8), time: 'Morning', units: [{ type: 'Split Type', quantity: 1 }],
  contactNumber: '09171234567', downPaymentPercent: 50, paymentStatus: 'partially_paid', balancePaymentStatus: 'None', ...over,
});
const reschedule = (body, as = 'CUS1') => call('PATCH', '/CZ-1/reschedule', as, { date: NEW_DAY(), time: 'Afternoon', ...body });
const audits = () => state.audits.filter((a) => a.action === 'booking.contact_change');

test('the rules: a name is letters only, a number is 7 to 15 digits, blank keeps what the booking has', () => {
  assert.equal(contactInputProblem({}), null);
  assert.equal(contactInputProblem({ contactName: '', contactNumber: '' }), null);
  assert.equal(contactInputProblem({ contactName: "Ma. José O'Brien-Cruz", contactNumber: '+63 917 123 4567' }), null);
  assert.match(contactInputProblem({ contactName: 'Ana 2' }).message, /Contact name can only have letters/);
  assert.match(contactInputProblem({ contactName: '<b>x</b>' }).message, /Contact name can only have letters/);
  assert.match(contactInputProblem({ contactName: 'A'.repeat(101) }).message, /100 characters or fewer/);
  assert.match(contactInputProblem({ contactName: { a: 1 } }).message, /must be text/);
  assert.match(contactInputProblem({ contactNumber: 'abc' }).message, /valid contact number/);
  assert.match(contactInputProblem({ contactNumber: '12345' }).message, /valid contact number/);
  assert.equal(contactInputProblem({ contactNumber: '1'.repeat(16) }).status, 400);
  const change = contactChange({ contactName: 'Ana Reyes', contactNumber: '09171234567' }, { name: 'Ana Reyes', number: '09171234567' });
  assert.equal(change.changed, false);
  assert.equal(contactChangeSentence(contactChange({ contactName: 'Cara Lim' }, { name: 'Ana Reyes' })), ' The customer also changed the contact name to Cara Lim.');
});

test('Pending: a changed name and number apply at once, to the booking only, with an audit line holding the old and the new values', async () => {
  book();
  const res = await reschedule({ contactName: 'Cara Lim', contactNumber: '09181112222' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.contactName, 'Cara Lim');
  assert.equal(saved.contactNumber, '09181112222');
  assert.equal(saved.date, NEW_DAY(), 'the date moved as before');
  assert.equal(res.body.contactName, 'Cara Lim', 'the customer sees it');
  // the customer's own account is untouched
  const account = state.users.find((u) => u._id === 'CUS1');
  assert.equal(account.name, 'Ana Reyes');
  assert.equal(account.phone, '09170000001');
  const [line] = audits();
  assert.ok(line, 'audited');
  assert.deepEqual(line.meta, { oldName: 'Ana Reyes', newName: 'Cara Lim', oldNumber: '09171234567', newNumber: '09181112222' });
  assert.equal(line.entityId, 'CZ-1');
});

test('Pending: the details the form was filled in with, left as they are, change nothing and write no audit line', async () => {
  book();
  const res = await reschedule({ contactName: 'Ana Reyes', contactNumber: '09171234567' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(state.bookings[0].contactName, undefined, 'no name is stored when it is the account name');
  assert.equal(state.bookings[0].contactNumber, '09171234567');
  assert.equal(audits().length, 0);
  const none = await reschedule({ date: goodDate(15) });
  assert.equal(none.status, 200);
  assert.equal(audits().length, 0);
});

test('only the number can change, and only the name can change', async () => {
  book();
  assert.equal((await reschedule({ contactNumber: '09185550000' })).status, 200);
  assert.equal(state.bookings[0].contactNumber, '09185550000');
  assert.equal(state.bookings[0].contactName, undefined);
  assert.deepEqual(audits()[0].meta, { oldNumber: '09171234567', newNumber: '09185550000' });
  assert.equal((await call('PATCH', '/CZ-1/reschedule', 'CUS1', { date: goodDate(16), time: 'Morning', contactName: 'Dino Cruz' })).status, 200);
  assert.equal(state.bookings[0].contactName, 'Dino Cruz');
});

test('invalid values are refused with a clear message, and nothing moves or changes', async () => {
  book();
  const before = JSON.stringify(state.bookings[0]);
  for (const [body, message] of [
    [{ contactName: 'Macaroni 85' }, /Contact name can only have letters/],
    [{ contactNumber: 'call me' }, /valid contact number/],
    [{ contactNumber: '123' }, /valid contact number/],
  ]) {
    const res = await reschedule(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.message, message);
  }
  assert.equal(JSON.stringify(state.bookings[0]), before);
  assert.equal(audits().length, 0);
});

test('Approved: the details wait on the request, the admin notice says they changed, and the booking keeps its old ones until approval', async () => {
  book({ status: 'Approved', technician: 'T1', assignments: [] });
  const res = await reschedule({ contactName: 'Cara Lim', contactNumber: '09181112222' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0];
  assert.equal(saved.rescheduleRequest.status, 'Pending');
  assert.equal(saved.rescheduleRequest.requestedContactName, 'Cara Lim');
  assert.equal(saved.rescheduleRequest.requestedContactNumber, '09181112222');
  assert.equal(saved.contactName, undefined, 'not applied yet');
  assert.equal(saved.contactNumber, '09171234567', 'not applied yet');
  assert.equal(audits().length, 0, 'nothing has changed on the booking yet');
  const notice = state.notes.find((n) => n.type === 'reschedule_requested');
  assert.match(notice.message, /Approval needed\. The customer also changed the contact name to Cara Lim and the contact number to 09181112222\./);
});

test('Approved: approving applies the details and audits them; denying leaves everything as it was', async () => {
  book({ status: 'Approved', technician: 'T1', assignments: [] });
  await reschedule({ contactName: 'Cara Lim', contactNumber: '09181112222' });
  const approved = await call('PATCH', '/CZ-1/reschedule/approve', 'ADM1', {}, asAdmin);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const saved = state.bookings[0];
  assert.equal(saved.contactName, 'Cara Lim');
  assert.equal(saved.contactNumber, '09181112222');
  assert.equal(saved.date, NEW_DAY());
  assert.deepEqual(audits()[0].meta, { oldName: 'Ana Reyes', newName: 'Cara Lim', oldNumber: '09171234567', newNumber: '09181112222' });
  assert.equal(state.users.find((u) => u._id === 'CUS1').phone, '09170000001', 'the profile is untouched');
});

test('Approved: a denied request leaves the contact details and the date unchanged', async () => {
  book({ status: 'Approved', technician: 'T1', assignments: [] });
  const oldDate = state.bookings[0].date;
  await reschedule({ contactName: 'Cara Lim', contactNumber: '09181112222' });
  const denied = await call('PATCH', '/CZ-1/reschedule/deny', 'ADM1', {}, asAdmin);
  assert.equal(denied.status, 200, JSON.stringify(denied.body));
  const saved = state.bookings[0];
  assert.equal(saved.contactName, undefined);
  assert.equal(saved.contactNumber, '09171234567');
  assert.equal(saved.date, oldDate);
  assert.equal(saved.rescheduleRequest.requestedContactName, undefined);
  assert.equal(audits().length, 0);
});

test('another customer cannot change the details, and the booking and its audit stay as they were', async () => {
  book();
  const before = JSON.stringify(state.bookings[0]);
  const res = await reschedule({ contactName: 'Mallory Lee', contactNumber: '09189999999' }, 'CUS2');
  assert.equal(res.status, 404);
  assert.equal(JSON.stringify(state.bookings[0]), before);
  assert.equal(audits().length, 0);
});

test('the technicians and the admin are shown the details, and a technician view carries the name', () => {
  const { toTechnicianView } = require('../utils/technicianView');
  assert.equal(toTechnicianView({ contactName: 'Cara Lim', contactNumber: '0918' }).contactName, 'Cara Lim');
  const { toCustomerView } = require('../utils/customerView');
  assert.equal(toCustomerView({ bookingId: 'CZ-1', contactName: 'Cara Lim' }).contactName, 'Cara Lim');
});

test('no reschedule rule changed: a too soon or unchanged slot is still refused with contact details attached', async () => {
  book();
  const soon = await call('PATCH', '/CZ-1/reschedule', 'CUS1', { date: goodDate(1), time: 'Morning', contactName: 'Cara Lim' });
  assert.equal(soon.status, 400);
  const same = await call('PATCH', '/CZ-1/reschedule', 'CUS1', { date: state.bookings[0].date, time: 'Morning', contactName: 'Cara Lim' });
  assert.equal(same.status, 400);
  assert.equal(state.bookings[0].contactName, undefined, 'a refused request saves nothing');
});

test('the reschedule screen has optional, prefilled, validated contact fields, and the details are shown to the customer, the admin and the technicians', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...p), 'utf8');
  const details = src('pages', 'customer', 'book_details.jsx');
  assert.match(details, /useState\(booking\.contactName \|\| readStoredUser\(\)\.name \|\| ''\)/, 'prefilled with the booking, else the account name');
  assert.match(details, /useState\(booking\.contactNumber \|\| readStoredUser\(\)\.phone \|\| ''\)/);
  assert.match(details, /namePartProblem\('Contact name', contactName\)/);
  assert.match(details, /!isValidContactNumber\(contactNumber\)/);
  assert.match(details, /Boolean\(contactNameProblem\) \|\| Boolean\(contactNumberProblem\)/, 'Confirm stays off while a value is invalid');
  assert.match(details, /These apply to this booking only\. Your profile does not change\./);
  assert.match(details, /onSubmit\(\{ date, time, contactName: contactName\.trim\(\), contactNumber: contactNumber\.trim\(\) \}\)/);
  assert.match(src('services', 'bookingService.js'), /body: \{ date, time, contactName, contactNumber \}/);
  assert.match(src('components', 'admin_service_details_modal.jsx'), /New contact details if approved/);
  assert.match(src('components', 'admin_service_details_modal.jsx'), /booking\.contactName \? `\$\{booking\.contactName\}, ` : ''/);
  assert.match(src('pages', 'staff', 'my_jobs.jsx'), /contactName: booking\.contactName \|\| ''/);
  assert.match(src('utils', 'auditText.js'), /'booking\.contact_change': 'Changed the contact details on a booking'/);
});
