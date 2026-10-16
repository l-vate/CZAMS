// Run with: npm test (inside server/).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readClosureInput, closedDateProblem, closureProblemFor, isRealDateKey, formatClosureDate } = require('../utils/closures');

const TODAY = '2026-10-08';
const add = (over) => readClosureInput({ date: '2026-12-25', reason: 'Christmas Day', ...over }, TODAY);

test('a valid future date with a reason is accepted and trimmed', () => {
  const r = add({ reason: '  Company outing ' });
  assert.equal(r.problem, null);
  assert.deepEqual(r.values, { date: '2026-12-25', reason: 'Company outing' });
});

test('today can be closed but a past date cannot', () => {
  assert.equal(add({ date: TODAY }).problem, null);
  assert.equal(add({ date: '2026-10-07' }).problem.status, 400);
});

test('a malformed or impossible date is a 400', () => {
  for (const date of [undefined, '', '12/25/2026', '2026-13-01', '2026-02-31', 20261225]) {
    assert.equal(add({ date }).problem.status, 400, String(date));
  }
  assert.equal(isRealDateKey('2028-02-29'), true);
  assert.equal(isRealDateKey('2027-02-29'), false);
});

test('the reason must be 3 to 200 characters', () => {
  for (const reason of [undefined, '', '  ', 'ab', 'x'.repeat(201)]) {
    assert.equal(add({ reason }).problem.status, 400, String(reason));
  }
  assert.equal(add({ reason: 'abc' }).problem, null);
  assert.equal(add({ reason: 'x'.repeat(200) }).problem, null);
});

test('the rejection reads: The shop is closed on <date>: <reason>', () => {
  const problem = closedDateProblem({ date: '2026-12-25', reason: 'Christmas Day' });
  assert.equal(problem.status, 400);
  assert.equal(problem.message, 'The shop is closed on December 25, 2026: Christmas Day');
  assert.equal(formatClosureDate('2026-01-05'), 'January 5, 2026');
});

test('a booking or reschedule on a closed date is rejected, on an open date it passes', async () => {
  const Closure = { findOne: (q) => ({ lean: async () => (q.date === '2026-12-25' ? { date: q.date, reason: 'Christmas Day' } : null) }) };
  const closed = await closureProblemFor(Closure, '2026-12-25');
  assert.equal(closed.status, 400);
  assert.equal(closed.message, 'The shop is closed on December 25, 2026: Christmas Day');
  assert.equal(await closureProblemFor(Closure, '2026-12-26'), null);
  assert.equal(await closureProblemFor(Closure, undefined), null);
});

test('the next free dates suggested after a disruption skip closure dates', () => {
  const { findNextFreeDates } = require('../utils/autoAssign');
  const technicians = [{ _id: 'T1' }, { _id: 'T2' }];
  const args = { minTechnicians: 2, technicians, afterDateKey: '2026-10-12', busyByDate: new Map(), limit: 3 };
  // 2026-10-17 is a Saturday, 2026-10-18 a Sunday (always skipped), so the week is Mon 13 to Sat 17, then Mon 19.
  assert.deepEqual(findNextFreeDates(args), ['2026-10-13', '2026-10-14', '2026-10-15']);
  assert.deepEqual(findNextFreeDates({ ...args, closedDates: new Set(['2026-10-13', '2026-10-15']) }), ['2026-10-14', '2026-10-16', '2026-10-17']);
});
