const test = require('node:test');
const assert = require('node:assert/strict');
const { readOffInput, offIdsAt, offByDate } = require('../utils/technicianOff');
const { blockIsOpen } = require('../utils/availability');

const TODAY = '2026-10-22';
const DATE = '2026-10-30';
const FIELD = ['T1', 'T2', 'T3', 'T4'];
const techs = FIELD.map((_id) => ({ _id }));

test('an admin can mark field technicians off in one or both blocks, with a short reason', () => {
  const ok = readOffInput({ technicians: ['T1', 'T2', 'T1'], date: DATE, blocks: ['Afternoon', 'Morning'], reason: ' Leave ' }, FIELD, TODAY);
  assert.equal(ok.problem, null);
  assert.deepEqual(ok.values, { technicians: ['T1', 'T2'], date: DATE, blocks: ['Morning', 'Afternoon'], reason: 'Leave' });
});

test('a day off is refused for a bad date, the past, no technician, an unknown technician, a bad block or a long reason', () => {
  const bad = (body) => readOffInput({ technicians: ['T1'], date: DATE, blocks: ['Morning'], ...body }, FIELD, TODAY).problem;
  assert.ok(bad({ date: 'nope' }));
  assert.match(bad({ date: '2026-10-01' }).message, /already passed/);
  assert.match(bad({ technicians: [] }).message, /at least one technician/);
  assert.match(bad({ technicians: ['ADM1'] }).message, /field technicians/);
  assert.match(bad({ blocks: [] }).message, /Morning, Afternoon/);
  assert.match(bad({ blocks: ['Evening'] }).message, /Morning, Afternoon/);
  assert.ok(bad({ reason: 'x'.repeat(201) }));
});

test('the technicians off in a block are found by date and block', () => {
  const rows = [
    { technician: 'T1', date: DATE, blocks: ['Morning'] },
    { technician: 'T2', date: DATE, blocks: ['Morning', 'Afternoon'] },
    { technician: 'T3', date: '2026-10-31', blocks: ['Morning'] },
  ];
  assert.deepEqual([...offIdsAt(rows, DATE, 'Morning')].sort(), ['T1', 'T2']);
  assert.deepEqual([...offIdsAt(rows, DATE, 'Afternoon')], ['T2']);
  assert.deepEqual([...offByDate(rows, 'Morning').get('2026-10-31')], ['T3']);
});

test('a block is closed to customers when too few technicians are left, and the other block stays open', () => {
  const args = { technicians: techs, bookings: [], date: DATE };
  assert.equal(blockIsOpen({ ...args, time: 'Morning' }), true);
  // two of four off: one pair left
  assert.equal(blockIsOpen({ ...args, time: 'Morning', offIds: new Set(['T1', 'T2']) }), true);
  // three of four off: no pair left
  assert.equal(blockIsOpen({ ...args, time: 'Morning', offIds: new Set(['T1', 'T2', 'T3']) }), false);
  // only the morning is off, the afternoon has no one off
  const rows = [{ technician: 'T1', date: DATE, blocks: ['Morning'] }, { technician: 'T2', date: DATE, blocks: ['Morning'] }, { technician: 'T3', date: DATE, blocks: ['Morning'] }];
  assert.equal(blockIsOpen({ ...args, time: 'Morning', offIds: offIdsAt(rows, DATE, 'Morning') }), false);
  assert.equal(blockIsOpen({ ...args, time: 'Afternoon', offIds: offIdsAt(rows, DATE, 'Afternoon') }), true);
});

test('a technician who is off and a technician already booked both use up the crew', () => {
  const booked = [{ date: DATE, time: 'Morning', status: 'Approved', assignments: [{ lead: 'T1', helper: 'T2' }] }];
  const base = { technicians: techs, bookings: booked, date: DATE, time: 'Morning' };
  assert.equal(blockIsOpen({ ...base, offIds: new Set() }), true); // T3 and T4 are still a pair
  assert.equal(blockIsOpen({ ...base, offIds: new Set(['T3']) }), false);
});
