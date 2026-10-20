// Run with: npm test (inside server/). A brand new customer account asks for its booking history: the answer is a 200 with an empty list, never an
// error. And the history card shows an error with a Try again button when the request fails; "no booking history" is only for a successful, empty
// answer. The real route runs; only the database is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const harness = require('./helpers/createBooking');
const BackJob = require('../models/BackJob');

const root = path.join(__dirname, '..', '..');

test.before(async () => {
  await harness.install();
  BackJob.countDocuments = async () => 0;
});
test.after(() => harness.close());
test.beforeEach(() => harness.reset({
  users: [{ _id: 'NEW1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Brand New' }, { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' }],
  services: [],
}));

test('a new account gets 200 and an empty history, for itself and for the admin looking at it', async () => {
  const mine = await harness.callPath('GET', '/api/users/me/history', 'NEW1');
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.deepEqual(mine.body.counts, { total: 0, completed: 0, cancelled: 0, pending: 0, approved: 0, inProgress: 0, backJobs: 0 });
  assert.deepEqual(mine.body.recent, []);
  assert.deepEqual(mine.body.feedback, []);
  assert.equal(mine.body.totalPaid, 0);
  const admin = await harness.callPath('GET', '/api/users/NEW1/history', 'ADM1', undefined, { role: 'admin' });
  assert.equal(admin.status, 200, JSON.stringify(admin.body));
  assert.equal(admin.body.counts.total, 0);
});

test('the history card: a failed request is an error with Try again, never the "no history" message', async () => {
  const { historyScreenState } = await import(pathToFileURL(path.join(root, 'src', 'utils', 'historyState.js')).href);
  const empty = { counts: { total: 0 }, recent: [], feedback: [] };
  assert.equal(historyScreenState({ failed: true, history: null }), 'error');
  assert.equal(historyScreenState({ failed: true, history: empty }), 'error', 'a failure wins over whatever was loaded before');
  assert.equal(historyScreenState({ failed: false, history: null }), 'loading');
  assert.equal(historyScreenState({ failed: false, history: empty }), 'empty', 'only a successful empty answer is "no history"');
  assert.equal(historyScreenState({ failed: false, history: { counts: { total: 2 }, recent: [{}], feedback: [] } }), 'ready');
  assert.equal(historyScreenState({ failed: false, history: { message: 'Server error' } }), 'error', 'an answer of the wrong shape is a failure too');

  const card = fs.readFileSync(path.join(root, 'src', 'components', 'customer_history.jsx'), 'utf8');
  assert.match(card, /Try again/);
  assert.match(card, /historyScreenState/);
  assert.doesNotMatch(card, /no booking history/i, 'the empty wording lives only in the summary, which shows only for a successful answer');
  const summary = fs.readFileSync(path.join(root, 'src', 'components', 'customer_history_summary.jsx'), 'utf8');
  assert.match(summary, /You have no booking history yet\./);
});
