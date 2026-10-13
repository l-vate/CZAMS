// Run with: npm test (inside server/).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readReason, buildHistoryEntry, viewHistory, idsIn } = require('../utils/assignmentHistory');
const { getLeadIds, getMemberIds } = require('../utils/assignments');

const now = new Date('2026-10-09T08:00:00Z');

test('the first assignment has an empty previous side', () => {
  const e = buildHistoryEntry({ before: [], after: [{ team: 't1', lead: 'A', helper: 'B' }], changedBy: 'ADM1', now });
  assert.deepEqual(e.previous, []);
  assert.deepEqual(e.next, [{ lead: 'A', helper: 'B' }]);
  assert.equal(e.changedBy, 'ADM1');
  assert.equal(e.changedAt, now);
  assert.equal('reason' in e, false);
});

test('a reassignment records both sides and the optional reason', () => {
  const e = buildHistoryEntry({ before: [{ lead: 'A', helper: 'B' }], after: [{ lead: 'C', helper: 'D' }], changedBy: 'ADM1', reason: 'Lead is sick', now });
  assert.deepEqual(e.previous, [{ lead: 'A', helper: 'B' }]);
  assert.deepEqual(e.next, [{ lead: 'C', helper: 'D' }]);
  assert.equal(e.reason, 'Lead is sick');
});

test('a solo technician has a null helper', () => {
  const e = buildHistoryEntry({ before: [], after: [{ lead: 'A' }], changedBy: 'ADM1', now });
  assert.deepEqual(e.next, [{ lead: 'A', helper: null }]);
});

test('the reason is trimmed, optional and at most 200 characters', () => {
  assert.deepEqual(readReason(undefined), { problem: null, reason: undefined });
  assert.deepEqual(readReason('  swap  '), { problem: null, reason: 'swap' });
  assert.deepEqual(readReason('   '), { problem: null, reason: undefined });
  assert.equal(readReason('x'.repeat(201)).problem.status, 400);
  assert.equal(readReason('x'.repeat(200)).problem, null);
  assert.equal(readReason(42).problem.status, 400);
});

test('an admin sees who changed it and why, a technician does not', () => {
  const entries = [buildHistoryEntry({ before: [{ lead: 'A', helper: 'B' }], after: [{ lead: 'C', helper: 'D' }], changedBy: 'ADM1', reason: 'Sick', now })];
  const names = new Map([['A', 'Anna'], ['B', 'Ben'], ['C', 'Cara'], ['D', 'Dan'], ['ADM1', 'Admin One']]);
  const forAdmin = viewHistory(entries, names, { admin: true })[0];
  assert.equal(forAdmin.changedBy, 'Admin One');
  assert.equal(forAdmin.reason, 'Sick');
  assert.deepEqual(forAdmin.next, [{ lead: 'Cara', helper: 'Dan' }]);
  const forTech = viewHistory(entries, names, { admin: false })[0];
  assert.equal('changedBy' in forTech, false);
  assert.equal('reason' in forTech, false);
  assert.deepEqual(forTech.previous, [{ lead: 'Anna', helper: 'Ben' }]);
  assert.equal(JSON.stringify(forTech).includes('Admin One'), false);
});

test('idsIn lists every person once', () => {
  const entries = [buildHistoryEntry({ before: [{ lead: 'A', helper: 'B' }], after: [{ lead: 'A', helper: 'D' }], changedBy: 'ADM1', now })];
  assert.deepEqual(idsIn(entries).sort(), ['A', 'ADM1', 'B', 'D']);
});

test('after a reassignment only the new lead is a lead and the old lead is not even a member', () => {
  const booking = { assignments: [{ team: 't2', lead: 'C', helper: 'D' }], technician: 'C' };
  assert.deepEqual(getLeadIds(booking), ['C']);
  assert.equal(getMemberIds(booking).includes('A'), false);
});
