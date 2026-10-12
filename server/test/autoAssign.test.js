// Run with: npm test (inside server/). Uses Node's built-in test runner, no extra packages.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickAssignment, findNextFreeDates, weekRange, addDays } = require('../utils/autoAssign');

const technicians = [
  { _id: 'T1', name: 'Anna' }, { _id: 'T2', name: 'Ben' }, { _id: 'T3', name: 'Cara' },
  { _id: 'T4', name: 'Dan' }, { _id: 'T5', name: 'Eli' }, { _id: 'T6', name: 'Fay' },
];
const base = { minTechnicians: 2, technicians, busyIds: [], weekBookings: [], upcomingBookings: [] };

test('a pair of the least busy technicians is chosen: lead and helper', () => {
  const r = pickAssignment({ ...base, busyIds: ['T1', 'T2', 'T3', 'T4'] });
  assert.deepEqual(r.assignment, { technicianId: 'T5', helperId: 'T6' });
});

test('one free technician is not enough for a two-person service', () => {
  const r = pickAssignment({ ...base, busyIds: ['T1', 'T2', 'T3', 'T4', 'T5'] });
  assert.equal(r.assignment, null);
  assert.match(r.reason, /Two technicians are not free/);
});

test('lightest week wins, the next lightest is the helper', () => {
  const week = [['T1'], ['T1'], ['T2'], ['T3'], ['T3'], ['T4'], ['T4'], ['T5'], ['T5'], ['T6']]; // T1 2, T2 1, T3 2, T4 2, T5 2, T6 1
  const r = pickAssignment({ ...base, weekBookings: week });
  assert.deepEqual(r.assignment, { technicianId: 'T2', helperId: 'T6' });
  assert.match(r.reason, /fewest bookings that week \(1 booking\)/);
});

test('tie on the week: fewest upcoming bookings decides the lead', () => {
  const r = pickAssignment({
    ...base,
    weekBookings: technicians.map((t) => [t._id]), // all tied on 1
    upcomingBookings: [['T1'], ['T1'], ['T2'], ['T3'], ['T3'], ['T4'], ['T4'], ['T5'], ['T5'], ['T6'], ['T6']], // T2 has 1, the rest 2
  });
  assert.equal(r.assignment.technicianId, 'T2');
  assert.match(r.reason, /tied for the week/);
});

test('tie on week and upcoming: name decides (A to Z)', () => {
  const r = pickAssignment({ ...base });
  assert.deepEqual(r.assignment, { technicianId: 'T1', helperId: 'T2' });
  assert.match(r.reason, /name \(A to Z\) decided/);
});

test('requested technician is free: they lead even if busier', () => {
  const r = pickAssignment({ ...base, requestedTechnicianId: 'T4', weekBookings: [['T4'], ['T4']] });
  assert.equal(r.assignment.technicianId, 'T4');
  assert.notEqual(r.assignment.helperId, 'T4');
  assert.match(r.reason, /Dan, the technician the customer asked for/);
});

test('requested technician is busy: falls back to the load rule and says so', () => {
  const r = pickAssignment({ ...base, requestedTechnicianId: 'T3', busyIds: ['T3'] });
  assert.deepEqual(r.assignment, { technicianId: 'T1', helperId: 'T2' });
  assert.match(r.reason, /Cara is busy then/);
});

test('solo service: the free technician with the lowest load, no helper', () => {
  const r = pickAssignment({
    ...base, minTechnicians: 1, busyIds: ['T1'],
    weekBookings: [['T2'], ['T2'], ['T3'], ['T3'], ['T4']],
  });
  assert.deepEqual(r.assignment, { technicianId: 'T5' }); // T5 and T6 have 0; T5 first by name
});

test('solo service: requested technician is chosen when free, skipped when busy', () => {
  const free = pickAssignment({ ...base, minTechnicians: 1, requestedTechnicianId: 'T2', weekBookings: [['T2'], ['T2']] });
  assert.deepEqual(free.assignment, { technicianId: 'T2' });
  const busy = pickAssignment({ ...base, minTechnicians: 1, requestedTechnicianId: 'T2', busyIds: ['T2'] });
  assert.notDeepEqual(busy.assignment, { technicianId: 'T2' });
  assert.match(busy.reason, /Ben is busy then/);
});

test('solo service: nobody free', () => {
  const r = pickAssignment({ ...base, minTechnicians: 1, busyIds: technicians.map((t) => t._id) });
  assert.equal(r.assignment, null);
  assert.match(r.reason, /No technician is free/);
});

test('week runs Monday to Sunday', () => {
  assert.deepEqual(weekRange('2026-10-07'), { start: '2026-10-05', end: '2026-10-11' }); // Wednesday
  assert.deepEqual(weekRange('2026-10-11'), { start: '2026-10-05', end: '2026-10-11' }); // Sunday
  assert.deepEqual(weekRange('2026-10-05'), { start: '2026-10-05', end: '2026-10-11' }); // Monday
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('next free dates: up to 3, Sundays skipped, only days where two technicians are free', () => {
  // Oct 10 2026 is a Saturday. Busy: Sat 10-10 is the booking day itself (not searched).
  const busyByDate = new Map([
    ['2026-10-12', new Set(['T1', 'T2', 'T3', 'T4', 'T5'])], // Monday: only one technician free
    ['2026-10-13', new Set(['T1', 'T2', 'T3'])],             // Tuesday: three free
  ]);
  const dates = findNextFreeDates({ minTechnicians: 2, technicians, afterDateKey: '2026-10-10', busyByDate });
  assert.deepEqual(dates, ['2026-10-13', '2026-10-14', '2026-10-15']); // Sun 10-11 skipped, Mon busy
});

test('next free dates for a solo service uses single technicians', () => {
  const busyByDate = new Map([['2026-10-12', new Set(technicians.map((t) => t._id))]]);
  const dates = findNextFreeDates({ minTechnicians: 1, technicians, afterDateKey: '2026-10-10', busyByDate, limit: 2 });
  assert.deepEqual(dates, ['2026-10-13', '2026-10-14']);
});

test('no free date in the search window: empty list', () => {
  const everyone = new Set(technicians.map((t) => t._id));
  const busyByDate = new Map();
  for (let i = 1; i <= 5; i += 1) busyByDate.set(addDays('2026-10-10', i), everyone);
  assert.deepEqual(findNextFreeDates({ minTechnicians: 2, technicians, afterDateKey: '2026-10-10', busyByDate, searchDays: 5 }), []);
});
