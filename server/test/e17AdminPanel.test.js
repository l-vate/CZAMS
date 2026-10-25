// Run with: npm test (inside server/). E17-1: the assigned technicians panel is one editable list (reorder makes another technician primary,
// remove respects the minimum, an older lead plus helper booking shows in the same list) and an audit entry reads as plain text with its
// details folded away. No database; the client files are loaded through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const render = async (file, props) => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const Component = (await vite.ssrLoadModule(file)).default;
  return renderToStaticMarkup(React.createElement(Component, props));
};

test('reordering makes another technician primary', async () => {
  const { moveItem } = await vite.ssrLoadModule('/src/utils/assignments.js');
  assert.deepEqual(moveItem(['A', 'B', 'C'], 1, 0), ['B', 'A', 'C']);
  assert.deepEqual(moveItem(['A', 'B', 'C'], 0, 2), ['B', 'C', 'A']);
  assert.deepEqual(moveItem(['A', 'B'], 0, -1), ['A', 'B'], 'out of range changes nothing');
  assert.deepEqual(moveItem(['A', 'B'], 1, 5), ['A', 'B']);
});

test('remove respects the minimum: never the last, never below the service minimum once past Pending', async () => {
  const { canRemoveTechnician } = await vite.ssrLoadModule('/src/utils/assignments.js');
  const cleaning = { serviceType: 'Cleaning' }; // needs two
  const checkUp = { serviceType: 'Check-up' }; // solo is allowed
  assert.equal(canRemoveTechnician({ count: 1, service: checkUp, status: 'Pending' }), false, 'never the last one');
  assert.equal(canRemoveTechnician({ count: 2, service: cleaning, status: 'Approved' }), false, 'a pair stays a pair');
  assert.equal(canRemoveTechnician({ count: 3, service: cleaning, status: 'Approved' }), true);
  assert.equal(canRemoveTechnician({ count: 2, service: cleaning, status: 'Pending' }), true, 'Pending is only checked at approval');
  assert.equal(canRemoveTechnician({ count: 2, service: checkUp, status: 'In Progress' }), true);
});

const legacy = {
  bookingId: 'CZ-1', status: 'Approved', date: '2026-11-10', time: 'Morning', service: { serviceType: 'Cleaning' },
  assignments: [{ lead: { _id: 'T1', name: 'Technician One' }, helper: { _id: 'T2', name: 'Technician Two' } }],
};

test('an older lead plus helper booking shows in one list, lead first, with one Primary badge', async () => {
  const { getMembers } = await vite.ssrLoadModule('/src/utils/assignments.js');
  assert.deepEqual(getMembers(legacy).map((m) => m.name), ['Technician One', 'Technician Two']);

  const html = await render('/src/components/assignment_panel.jsx', { booking: legacy });
  assert.equal((html.match(/>Primary</g) || []).length, 1);
  assert.equal((html.match(/assignment-badge/g) || []).length >= 2, true);
  assert.doesNotMatch(html, /\(primary, files the report\)/, 'no second bulleted list repeating the same people');
  assert.doesNotMatch(html, /Lead|Helper/);
  const first = html.indexOf('Technician One');
  const second = html.indexOf('Technician Two');
  assert.ok(first > -1 && second > first);
  assert.match(html, /aria-label="Make primary"/, 'the second technician can be made primary');
});

test('a finished booking shows the same list read-only', async () => {
  const html = await render('/src/components/assignment_panel.jsx', { booking: { ...legacy, status: 'Completed' } });
  assert.match(html, /Primary/);
  assert.doesNotMatch(html, /<select|Remove|Save assignment/);
});

const line = {
  _id: 'A1', action: 'technician_off.set', entityType: 'TechnicianOff', entityId: '2026-11-25', createdAt: '2026-10-22T03:13:00.000Z',
  actor: { id: 'ADM1', name: 'Charlz Layug', role: 'admin' },
  summary: 'Marked technicians as not available on a date',
  meta: { date: '2026-11-25', blocks: ['Morning', 'Afternoon'], technicians: ['STF4223', 'd6c6325b-9eb1-4dcb-b3c8-3ff765377802'] },
};

test('an audit entry reads as one plain line, with the raw JSON folded away by default', async () => {
  const { describeAudit } = await vite.ssrLoadModule('/src/utils/auditText.js');
  const said = describeAudit(line);
  assert.equal(said.who, 'Charlz Layug');
  assert.equal(said.what, 'Marked technicians as not available on a date');
  assert.match(said.when, /Oct 22, 2026/);
  assert.match(said.when, /11:13/, 'Manila time, not UTC');

  const html = await render('/src/components/audit_entry.jsx', { line });
  assert.match(html, /Charlz Layug/);
  assert.match(html, /Marked technicians as not available on a date/);
  assert.match(html, /View details/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /\{|STF4223|&quot;date&quot;|technician_off\.set/, 'no raw JSON or action code until asked');
});

test('View details holds the action, the record and the values', async () => {
  const html = await render('/src/components/audit_entry.jsx', { line, startOpen: true });
  assert.match(html, /Hide details/);
  assert.match(html, /technician_off\.set/);
  assert.match(html, /TechnicianOff 2026-11-25/);
  assert.match(html, /STF4223/);
});

test('an entry with no summary falls back to plain words for the action code', async () => {
  const { describeAudit } = await vite.ssrLoadModule('/src/utils/auditText.js');
  assert.equal(describeAudit({ action: 'payment.verify', actor: { id: 'ADM1' } }).what, 'Verified a payment');
  assert.equal(describeAudit({ action: 'closure.create', actor: {} }).what, 'Closure create');
  assert.equal(describeAudit({ action: 'x', actor: {} }).who, 'Unknown');
});
