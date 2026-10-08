// Run with: npm test (inside server/). Tests the My Jobs sort helper, which has no browser-only imports.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'jobSort.js')).href);

const jobs = [
  { id: 'a', status: 'Completed', date: '2026-10-05' },
  { id: 'b', status: 'Cancelled', date: '2026-10-01' },
  { id: 'c', status: 'Approved', date: '2026-10-20' },
  { id: 'd', status: 'In Progress', date: '2026-10-10' },
  { id: 'e', status: 'Approved', date: '2026-10-12' },
];
const ids = (list) => list.map((j) => j.id).join('');

test('service date soonest first and latest first', async () => {
  const { sortJobs, JOB_SORT } = await load();
  assert.equal(ids(sortJobs(jobs, JOB_SORT.SERVICE_SOONEST)), 'badec');
  assert.equal(ids(sortJobs(jobs, JOB_SORT.SERVICE_LATEST)), 'cedab');
});

test('status order is In Progress, Approved, Completed, Cancelled, then soonest within a status', async () => {
  const { sortJobs, JOB_SORT } = await load();
  assert.equal(ids(sortJobs(jobs, JOB_SORT.STATUS)), 'decab');
});

test('newest and oldest keep their original meaning and newest is the default', async () => {
  const { sortJobs, JOB_SORT } = await load();
  assert.equal(ids(sortJobs(jobs, JOB_SORT.NEWEST)), 'cedab');
  assert.equal(ids(sortJobs(jobs, JOB_SORT.OLDEST)), 'badec');
  assert.equal(ids(sortJobs(jobs, undefined)), 'cedab');
});

test('sorting does not change the list it was given, and unknown statuses go last', async () => {
  const { sortJobs, JOB_SORT } = await load();
  const copy = jobs.map((j) => j.id).join('');
  sortJobs(jobs, JOB_SORT.STATUS);
  assert.equal(ids(jobs), copy);
  const withPending = [...jobs, { id: 'p', status: 'Pending', date: '2026-09-01' }];
  assert.equal(ids(sortJobs(withPending, JOB_SORT.STATUS)).slice(-1), 'p');
});

test('the options list has the five sorts with the requested labels', async () => {
  const { JOB_SORT_OPTIONS } = await load();
  assert.deepEqual(JOB_SORT_OPTIONS.map((o) => o.label), ['Newest first', 'Oldest first', 'Service date, soonest first', 'Service date, latest first', 'Status']);
});
