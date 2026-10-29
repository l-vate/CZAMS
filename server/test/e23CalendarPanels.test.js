// Run with: npm test (inside server/). E23: the Technician Availability and Closed Dates sections on the admin Calendar page are collapsible
// panels with a summary, short lists of upcoming entries, past entries behind a toggle, one heading per date, one capitalization for reasons and
// one button style. Leave and closure rules, the API and the audit log are not touched. Fixed dates only, so nothing depends on the weekday.
// No database; the client files are loaded through Vite.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));
const read = (file) => fs.readFileSync(path.join(root, 'src', file), 'utf8');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });

const html = async (file, props = {}) => {
  const React = fromRoot('react');
  const { renderToStaticMarkup } = fromRoot('react-dom/server');
  const Component = (await vite.ssrLoadModule(file)).default;
  return renderToStaticMarkup(React.createElement(Component, props));
};

const TODAY = '2026-11-10';
const off = (date, name, reason = 'leave') => ({ _id: `${date}-${name}`, date, technicianName: name, blocks: ['Morning', 'Afternoon'], reason });

test('each section is a panel with a header button: aria-expanded, controls the list, summary shown while collapsed', async () => {
  for (const [file, id, summary] of [
    ['/src/components/technician_availability_manager.jsx', 'tech-leave-list', 'Technician leave, none upcoming'],
    ['/src/components/closure_manager.jsx', 'closed-dates-list', 'Closed dates, none upcoming'],
  ]) {
    const out = await html(file);
    assert.match(out, new RegExp(`<button[^>]*type="button"[^>]*class="cal-panel-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="${id}"`));
    assert.ok(out.includes(`>${summary}<`), summary);
    assert.match(out, new RegExp(`id="${id}"[^>]*hidden`), 'the list is hidden while collapsed');
  }
});

test('the add forms stay outside the collapsible part, at the top, with navy buttons', async () => {
  const tech = await html('/src/components/technician_availability_manager.jsx');
  assert.ok(tech.indexOf('Mark as not available') < tech.indexOf('cal-panel-toggle'));
  const closure = await html('/src/components/closure_manager.jsx');
  assert.ok(closure.indexOf('Close this date') < closure.indexOf('cal-panel-toggle'));
  assert.match(read('css/components/closures.css'), /\.closure-manager \.ma-submit-btn \{ background: var\(--navy\)/);
});

test('the panel button is a real button (keyboard operable) that flips the state and remembers it for the session', () => {
  const src = read('components/collapsible_panel.jsx');
  const hook = read('hooks/usePanelOpen.js');
  assert.match(src, /<button\s+type="button"\s+className="cal-panel-toggle"\s+aria-expanded=\{open\}\s+aria-controls=\{id\}\s+onClick=\{\(\) => onToggle\(!open\)\}/);
  assert.match(src, /hidden=\{!open\}/);
  assert.match(hook, /writePanelOpen\(key, value\)/);
  assert.match(read('utils/calendarPanels.js'), /sessionStorage/);
});

test('the panels open after the admin adds an entry, and are closed otherwise', () => {
  assert.match(read('components/technician_availability_manager.jsx'), /setOpen\(true\); \/\/ show the new entry/);
  assert.match(read('components/closure_manager.jsx'), /setOpen\(true\); \/\/ show the new closure/);
  assert.match(read('hooks/usePanelOpen.js'), /\?\? false/);
});

test('the collapsed summaries count correctly', async () => {
  const { leaveSummary, closureSummary } = await vite.ssrLoadModule('/src/utils/calendarPanels.js');
  const { groupClosures } = await vite.ssrLoadModule('/src/utils/closureDates.js');
  assert.equal(leaveSummary(4), 'Technician leave, 4 upcoming');
  assert.equal(leaveSummary(0), 'Technician leave, none upcoming');
  const groups = groupClosures([{ date: '2026-12-10', reason: 'Holiday' }, { date: '2026-12-11', reason: 'Holiday' }, { date: '2026-12-12', reason: 'Holiday' }]);
  assert.equal(closureSummary(groups), 'Closed dates, 1 range (3 days)');
  assert.equal(closureSummary([...groups, ...groupClosures([{ date: '2026-12-20', reason: 'Other' }])]), 'Closed dates, 2 ranges (4 days)');
  assert.equal(closureSummary(groupClosures([{ date: '2026-12-20', reason: 'Other' }])), 'Closed dates, 1 range (1 day)');
  assert.equal(closureSummary([]), 'Closed dates, none upcoming');
});

test('only today and later is upcoming; earlier entries are kept apart for the Show past entries toggle', async () => {
  const { splitUpcoming } = await vite.ssrLoadModule('/src/utils/calendarPanels.js');
  const { upcoming, past } = splitUpcoming([off('2026-11-09', 'A'), off('2026-11-10', 'B'), off('2026-11-11', 'C')], TODAY);
  assert.deepEqual(upcoming.map((e) => e.technicianName), ['B', 'C']);
  assert.deepEqual(past.map((e) => e.technicianName), ['A']);
  const ranges = splitUpcoming([{ start: '2026-11-08', end: '2026-11-10' }, { start: '2026-11-01', end: '2026-11-02' }], TODAY, 'end');
  assert.equal(ranges.upcoming.length, 1, 'a range that ends today is still upcoming');
  assert.equal(ranges.past.length, 1);
  for (const file of ['technician_availability_manager', 'closure_manager']) {
    const src = read(`components/${file}.jsx`);
    assert.match(src, /Show past entries/);
    assert.match(src, /Hide past entries/);
    assert.match(src, /aria-expanded=\{showPast\}/);
  }
});

test('the first 5 entries show with Show all (N), and the same date shows one heading with every technician under it', async () => {
  const { groupByDate, limitGroups } = await vite.ssrLoadModule('/src/utils/calendarPanels.js');
  const entries = [off('2026-11-12', 'Ana'), off('2026-11-11', 'Ben'), off('2026-11-11', 'Cai'), off('2026-11-13', 'Dan'), off('2026-11-14', 'Eli'), off('2026-11-15', 'Fay'), off('2026-11-16', 'Gus')];
  const groups = groupByDate(entries);
  assert.deepEqual(groups.map(([d]) => d), ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'], 'sorted by date, each date once');
  assert.deepEqual(groups[0][1].map((e) => e.technicianName), ['Ben', 'Cai']);
  const shown = limitGroups(groups, 5);
  assert.equal(shown.reduce((n, g) => n + g[1].length, 0), 5);
  assert.equal(limitGroups(groups, 50).length, groups.length);
  for (const file of ['technician_availability_manager', 'closure_manager']) {
    const src = read(`components/${file}.jsx`);
    assert.match(src, /Show all \(\{/);
    assert.match(src, /setShowAll\(true\)/);
  }
  assert.match(read('components/technician_availability_manager.jsx'), /<strong>\{formatClosureDate\(day\)\}<\/strong>/);
});

test('a reason reads the same everywhere: the first letter is capitalized', async () => {
  const { capitalizeReason } = await vite.ssrLoadModule('/src/utils/calendarPanels.js');
  assert.equal(capitalizeReason('leave'), 'Leave');
  assert.equal(capitalizeReason('Leave'), 'Leave');
  assert.equal(capitalizeReason('  holiday break '), 'Holiday break');
  assert.equal(capitalizeReason(''), '');
  assert.match(read('components/technician_availability_manager.jsx'), /capitalizeReason\(entry\.reason\)/);
  assert.match(read('components/closure_manager.jsx'), /capitalizeReason\(g\.reason\)/);
});

test('Available again, Open all again, Open single days and Open share one button style with a focus state and a 44 px phone target', () => {
  const css = read('css/components/closures.css');
  assert.match(css, /\.cal-action-btn \{[^}]*border: 1\.5px solid var\(--navy\)/);
  assert.match(css, /\.cal-action-btn:focus-visible/);
  assert.match(css, /@media \(max-width: 768px\) \{\s*\.cal-action-btn \{ min-height: 44px/);
  const tech = read('components/technician_availability_manager.jsx');
  assert.match(tech, /className="cal-action-btn" onClick=\{\(\) => onClear\(entry\._id\)\}>Available again</);
  const closure = read('components/closure_manager.jsx');
  assert.match(closure, /<summary className="cal-action-btn">Open single days<\/summary>/);
  assert.match(closure, /className="cal-action-btn" onClick=\{\(\) => handleDelete\(g\.days\.map/);
  assert.match(closure, /Open all again/);
});

test('leave and closure actions behave as before: the same service calls and no extra confirmation or API change', () => {
  const tech = read('components/technician_availability_manager.jsx');
  assert.match(tech, /setTechnicianOff\(\{ technicians: picked, date, blocks, reason: reason\.trim\(\) \}\)/);
  assert.match(tech, /clearTechnicianOff\(id\)/);
  assert.match(tech, /Choose at least one technician\./);
  const closure = read('components/closure_manager.jsx');
  assert.match(closure, /addClosure\(\{ date: day, reason: text \}\)/);
  assert.match(closure, /deleteClosure\(day\)/);
  assert.match(closure, /That date is already closed\./);
  assert.match(closure, /Close at most \$\{MAX_RANGE_DAYS\} days at a time\./);
});
