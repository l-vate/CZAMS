// Run with: npm test (inside server/). Feedback: a whole-number rating from 1 to 5, a comment of at most 500 characters,
// owner only, Completed only, editable for 24 hours with each earlier version kept. Reschedule: only a Pending booking
// (moves straight away) or an Approved one (needs approval); one open request per booking, and a repeat or a double
// click neither changes anything nor notifies the admins again. The real routes run; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFeedback, COMMENT_MAX } = require('../utils/feedbackInput');
const harness = require('./helpers/createBooking');

const { state, call, addBooking, goodDate } = harness;

const cleaning = { _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const booking = (over = {}) => addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: cleaning, status: 'Completed', date: '2026-09-01', time: 'Morning', ...over });
const feedback = (body, as = 'CUS1') => call('PATCH', '/CZ-1/feedback', as, body);
const reschedule = (body, as = 'CUS1') => call('PATCH', '/CZ-1/reschedule', as, body);
const types = (user) => state.notes.filter((n) => n.user === user).map((n) => n.type);

test.before(() => harness.install());
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [{ _id: 'CUS1', role: 'customer', isActive: true }, { _id: 'CUS2', role: 'customer', isActive: true }, { _id: 'ADM1', role: 'admin', isActive: true }, { _id: 'ADM2', role: 'admin', isActive: true }],
  services: [cleaning],
}));

// ---- feedback: the rules on their own
test('the rating must be a whole number from 1 to 5', () => {
  [1, 2, 3, 4, 5, '3', ' 5 '].forEach((rating) => assert.equal(readFeedback({ rating }).problem, null, String(rating)));
  [4.5, 0, 6, -1, '', null, undefined, 'abc', '4.5', '0', '6', true, [], {}, NaN, Infinity, '1e0'].forEach((rating) => {
    assert.equal(readFeedback({ rating }).problem.status, 400, String(rating));
  });
});

test('the comment is optional text of at most 500 characters, trimmed', () => {
  assert.deepEqual(readFeedback({ rating: 5 }).values, { rating: 5, text: '' });
  assert.deepEqual(readFeedback({ rating: 5, text: '  Great  ' }).values, { rating: 5, text: 'Great' });
  assert.equal(readFeedback({ rating: 5, text: 'x'.repeat(COMMENT_MAX) }).problem, null);
  assert.match(readFeedback({ rating: 5, text: 'x'.repeat(COMMENT_MAX + 1) }).problem.message, /500 characters/);
  assert.equal(readFeedback({ rating: 5, text: 123 }).problem.status, 400);
  assert.equal(readFeedback({ rating: 5, text: { a: 1 } }).problem.status, 400);
});

// ---- feedback: the route
test('good feedback is saved on a completed booking of the owner', async () => {
  booking();
  const res = await feedback({ rating: 5, text: 'Very good' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(state.bookings[0].feedback.rating, 5);
  assert.equal(state.bookings[0].feedback.text, 'Very good');
  assert.ok(state.bookings[0].feedback.createdAt);
});

test('a rating of 4.5, 0 or 6 and a long comment are 400s and nothing is saved', async () => {
  booking();
  for (const body of [{ rating: 4.5 }, { rating: 0 }, { rating: 6 }, { rating: 5, text: 'x'.repeat(501) }, {}]) {
    assert.equal((await feedback(body)).status, 400, JSON.stringify(body).slice(0, 30));
  }
  assert.equal(state.bookings[0].feedback, undefined);
});

test('only the owner, and only once the booking is Completed', async () => {
  booking();
  assert.equal((await feedback({ rating: 5 }, 'CUS2')).status, 404);
  state.bookings[0].status = 'In Progress';
  assert.equal((await feedback({ rating: 5 })).status, 400);
  assert.equal(state.bookings[0].feedback, undefined);
});

test('an edit inside 24 hours replaces the feedback and keeps the earlier version with the time it was replaced', async () => {
  booking();
  await feedback({ rating: 3, text: 'OK' });
  const res = await feedback({ rating: 5, text: 'Better after all' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = state.bookings[0].feedback;
  assert.equal(saved.rating, 5);
  assert.ok(saved.editedAt, 'the edit has a time');
  assert.equal(saved.edits.length, 1);
  assert.deepEqual({ rating: saved.edits[0].rating, text: saved.edits[0].text }, { rating: 3, text: 'OK' });
  assert.ok(saved.edits[0].replacedAt);
  await feedback({ rating: 4 });
  assert.equal(state.bookings[0].feedback.edits.length, 2, 'every edit is kept');
});

test('after 24 hours the feedback can no longer be changed', async () => {
  booking({ feedback: { rating: 3, text: 'OK', createdAt: new Date(Date.now() - 25 * 3600000).toISOString() } });
  const res = await feedback({ rating: 5 });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /24-hour window/);
  assert.equal(state.bookings[0].feedback.rating, 3);
});

// ---- reschedule
const FUTURE = () => goodDate(14);

test('Pending moves straight away; Approved asks for approval; every other status is refused', async () => {
  booking({ status: 'Pending', date: goodDate(7) });
  assert.equal((await reschedule({ date: FUTURE(), time: 'Afternoon' })).status, 200);
  assert.equal(state.bookings[0].date, FUTURE());

  for (const status of ['In Progress', 'Completed', 'Cancelled']) {
    harness.reset({ users: state.users, services: state.services });
    booking({ status, date: goodDate(7) });
    const res = await reschedule({ date: FUTURE(), time: 'Morning' });
    assert.equal(res.status, 400, status);
    assert.match(res.body.message, new RegExp(`${status} booking can no longer be rescheduled`));
    assert.equal(state.bookings[0].date, goodDate(7), 'nothing changed');
    assert.deepEqual(state.notes, []);
  }
});

test('an Approved booking keeps its date; the request waits, and the admins and the customer are told once each', async () => {
  booking({ status: 'Approved', date: goodDate(7) });
  const res = await reschedule({ date: FUTURE(), time: 'Afternoon' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(state.bookings[0].date, goodDate(7), 'the customer cannot change an Approved date directly');
  assert.deepEqual(state.bookings[0].rescheduleRequest, { requestedDate: FUTURE(), requestedTime: 'Afternoon', status: 'Pending' });
  assert.deepEqual(types('ADM1'), ['reschedule_requested']);
  assert.deepEqual(types('ADM2'), ['reschedule_requested']);
  assert.deepEqual(types('CUS1'), ['reschedule_received']);
  assert.equal(state.notes.find((n) => n.user === 'CUS1').relatedBookingId, 'CZ-1');
  assert.match(state.notes.find((n) => n.user === 'CUS1').message, /received your request/);
});

test('a second request while one is open is refused and notifies nobody again', async () => {
  booking({ status: 'Approved', date: goodDate(7) });
  await reschedule({ date: FUTURE(), time: 'Afternoon' });
  const notesBefore = state.notes.length;
  const again = await reschedule({ date: goodDate(18), time: 'Morning' });
  assert.equal(again.status, 400);
  assert.match(again.body.message, /already asked to move/);
  assert.equal(state.notes.length, notesBefore, 'no extra notification');
  assert.equal(state.bookings[0].rescheduleRequest.requestedDate, FUTURE(), 'the first request stands');
});

test('two requests at the same moment: one is saved, one is refused, the admins hear once', async () => {
  booking({ status: 'Approved', date: goodDate(7) });
  const results = await Promise.all([reschedule({ date: FUTURE(), time: 'Afternoon' }), reschedule({ date: goodDate(18), time: 'Morning' })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal(types('ADM1').length, 1);
  assert.equal(types('CUS1').length, 1);
});

test('after the admin answers, a new request is allowed again', async () => {
  booking({ status: 'Approved', date: goodDate(7) });
  await reschedule({ date: FUTURE(), time: 'Afternoon' });
  state.bookings[0].rescheduleRequest.status = 'Denied';
  assert.equal((await reschedule({ date: goodDate(18), time: 'Morning' })).status, 200);
});

test('moving to the date and time the booking already has is refused, and someone else cannot move it', async () => {
  booking({ status: 'Approved', date: goodDate(7), time: 'Morning' });
  assert.equal((await reschedule({ date: goodDate(7), time: 'Morning' })).status, 400);
  assert.equal((await reschedule({ date: FUTURE(), time: 'Morning' }, 'CUS2')).status, 404);
  assert.deepEqual(state.notes, []);
});
