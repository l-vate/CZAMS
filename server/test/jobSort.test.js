// Run with: npm test (inside server/). Tests the My Jobs sort helper, which has no browser-only imports.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'jobSort.js')).href);

// `date` is the service date; `createdAt` is when the booking was made. They deliberately disagree.
const jobs = [
  { id: 'a', status: 'Completed', date: '2026-10-05', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'b', status: 'Cancelled', date: '2026-10-01', createdAt: '2026-09-20T08:00:00Z' },
  { id: 'c', status: 'Approved', date: '2026-10-20', createdAt: '2026-09-10T08:00:00Z' },
  { id: 'd', status: 'In Progress', date: '2026-10-10', createdAt: '2026-09-30T08:00:00Z' },
  { id: 'e', status: 'Approved', date: '2026-10-12', createdAt: '2026-09-15T08:00:00Z' },
];
const ids = (list) => list.map((j) => j.id).join('');

test('newest and oldest booking created use when the booking was made, not the service date', async () => {
  const { sortJobs, JOB_SORT } = await load();
  assert.equal(ids(sortJobs(jobs, JOB_SORT.NEWEST)), 'dbeca'); // 09-30, 09-20, 09-15, 09-10, 09-01
  assert.equal(ids(sortJobs(jobs, JOB_SORT.OLDEST)), 'acebd');
});

test('service date soonest is by the service date', async () => {
  const { sortJobs, JOB_SORT } = await load();
  assert.equal(ids(sortJobs(jobs, JOB_SORT.SERVICE_SOONEST)), 'badec');
});

test('status order is In Progress, Approved, Completed, Cancelled, then soonest within a status', async () => {
  const { sortJobs, JOB_SORT } = await load();
  assert.equal(ids(sortJobs(jobs, JOB_SORT.STATUS)), 'decab');
});

test('the four sorts give four different orders', async () => {
  const { sortJobs, JOB_SORT } = await load();
  const orders = Object.values(JOB_SORT).map((k) => ids(sortJobs(jobs, k)));
  assert.equal(orders.length, 4);
  assert.equal(new Set(orders).size, 4);
});

test('newest booking created is the default', async () => {
  const { sortJobs, JOB_SORT } = await load();
  assert.equal(ids(sortJobs(jobs, undefined)), ids(sortJobs(jobs, JOB_SORT.NEWEST)));
});

test('a booking with no created time sorts as the oldest, and ties keep service date order', async () => {
  const { sortJobs, JOB_SORT } = await load();
  const mixed = [
    { id: 'x', status: 'Approved', date: '2026-10-09' },
    { id: 'y', status: 'Approved', date: '2026-10-03' },
    { id: 'z', status: 'Approved', date: '2026-10-05', createdAt: '2026-09-01T00:00:00Z' },
  ];
  assert.equal(ids(sortJobs(mixed, JOB_SORT.OLDEST)), 'yxz'); // y and x have no created time: service date order, then z
  assert.equal(ids(sortJobs(mixed, JOB_SORT.NEWEST)), 'zxy');
});

test('sorting does not change the list it was given, and unknown statuses go last', async () => {
  const { sortJobs, JOB_SORT } = await load();
  const copy = jobs.map((j) => j.id).join('');
  sortJobs(jobs, JOB_SORT.STATUS);
  assert.equal(ids(jobs), copy);
  const withPending = [...jobs, { id: 'p', status: 'Pending', date: '2026-09-01', createdAt: '2026-09-02T00:00:00Z' }];
  assert.equal(ids(sortJobs(withPending, JOB_SORT.STATUS)).slice(-1), 'p');
});

test('the options list has the four sorts with the requested labels', async () => {
  const { JOB_SORT_OPTIONS } = await load();
  assert.deepEqual(JOB_SORT_OPTIONS.map((o) => o.label), ['Newest booking created', 'Oldest booking created', 'Service date soonest', 'Status']);
});
