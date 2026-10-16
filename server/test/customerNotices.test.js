// Run with: npm test (inside server/). The customer is told, once and with a link to the booking, when the lead reports
// a disruption (no reason, no technician details) and when a reschedule request of theirs is received. A repeat report
// or request adds nothing. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/createBooking');

const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const inProgress = () => addBooking({
  bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'In Progress', date: goodDate(0), time: 'Morning',
  technician: 'T1', assignments: [{ lead: 'T1', helper: 'T2' }],
});
const report = (reason, as = 'T1') => call('PATCH', '/CZ-1/disruption/report', as, { reason }, { role: 'staff' });
const forCustomer = () => state.notes.filter((n) => n.user === 'CUS1');

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [
    { _id: 'CUS1', role: 'customer', isActive: true }, { _id: 'ADM1', role: 'admin', isActive: true },
    { _id: 'T1', role: 'staff', isActive: true, name: 'Ana Lead', position: 'Technician' }, { _id: 'T2', role: 'staff', isActive: true, name: 'Ben Helper', position: 'Technician' },
  ],
  services: [cleaning],
}));

test('a disruption reported by the lead tells the customer once, with a link, and says nothing about why or who', async () => {
  inProgress();
  const res = await report('Ceiling collapsed in the unit room, owner shouting at Ana');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(forCustomer().length, 1);
  const note = forCustomer()[0];
  assert.equal(note.type, 'disruption_notice');
  assert.equal(note.relatedBookingId, 'CZ-1');
  assert.match(note.message, /interrupted.*arranging a new schedule/);
  ['Ceiling', 'collapsed', 'Ana', 'Ben', 'Lead', 'Helper', 'owner'].forEach((word) => assert.equal(note.message.includes(word), false, word));
  assert.equal(state.notes.filter((n) => n.user === 'ADM1').length, 1, 'the admin is still told');
});

test('a second report while one is open is refused and the customer is not told again', async () => {
  inProgress();
  await report('Storm');
  const again = await report('Storm again');
  assert.equal(again.status, 400);
  assert.equal(forCustomer().length, 1);
  assert.equal(state.bookings[0].disruption.reason, 'Storm', 'the first report stands');
});

test('two reports at the same moment: one is saved, one refused, one notification', async () => {
  inProgress();
  const results = await Promise.all([report('Storm'), report('Rain')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal(forCustomer().length, 1);
});

test('a helper cannot report, and nothing is sent', async () => {
  inProgress();
  const res = await report('Storm', 'T2');
  assert.equal(res.status, 403);
  assert.deepEqual(state.notes, []);
});

test('a job that is not In Progress cannot have a disruption reported', async () => {
  inProgress();
  state.bookings[0].status = 'Approved';
  assert.equal((await report('Storm')).status, 400);
  assert.deepEqual(state.notes, []);
});

test('after the admin reschedules and the job is interrupted again, the customer is told again (a new interruption)', async () => {
  inProgress();
  await report('Storm');
  Object.assign(state.bookings[0], { status: 'In Progress', disruption: { status: 'Rescheduled', reason: 'Storm' } });
  assert.equal((await report('Power cut')).status, 200);
  assert.equal(forCustomer().length, 2);
});
