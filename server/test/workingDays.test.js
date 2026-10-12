// Run with: npm test (inside server/). The browser's working-day rules for the extension form must agree with the
// server's (utils/extensionDays.js), so the day offered by default is always one the server accepts.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const server = require('../utils/extensionDays');
const { manilaTodayKey: serverToday } = require('../utils/timeBlocks');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'workingDays.js')).href);

test('the browser and the server pick the same next working day, across a whole year, with and without closures', async () => {
  const client = await load();
  const closed = new Set(['2026-12-25', '2026-12-26', '2027-01-01', '2026-11-02']);
  let key = '2026-10-01';
  for (let i = 0; i < 400; i += 1) {
    assert.equal(client.nextWorkingDayKey(key), server.nextWorkingDayKey(key), `plain ${key}`);
    assert.equal(client.nextWorkingDayKey(key, closed), server.nextWorkingDayKey(key, closed), `closed ${key}`);
    assert.equal(client.isSundayKey(key), server.isSundayKey ? server.isSundayKey(key) : server.isSunday(key));
    key = client.addDaysKey(key, 1);
  }
});

test('the default extra day is after the job\'s date, or after today when the job is older', async () => {
  const { defaultExtensionDate } = await load();
  assert.equal(defaultExtensionDate('2026-10-21', new Set(), '2026-10-20'), '2026-10-22'); // job tomorrow
  assert.equal(defaultExtensionDate('2026-10-19', new Set(), '2026-10-20'), '2026-10-21'); // job date already past
  assert.equal(defaultExtensionDate('2026-10-24', new Set(), '2026-10-24'), '2026-10-26'); // Saturday skips Sunday
  assert.equal(defaultExtensionDate('', new Set(), '2026-10-20'), '2026-10-21'); // no date known
  assert.equal(defaultExtensionDate('2026-10-24', new Set(['2026-10-26']), '2026-10-20'), '2026-10-27'); // closed Monday
});

test('the default is always accepted by the server\'s own rule', async () => {
  const { defaultExtensionDate } = await load();
  const today = '2026-10-20';
  for (let i = 0; i < 60; i += 1) {
    const jobDate = server.addDays(today, i - 5);
    const day = defaultExtensionDate(jobDate, new Set(), today);
    assert.equal(server.extensionSlotProblem({ date: day, time: 'Morning' }, { date: jobDate, time: 'Morning', extensionDays: [] }, today), null, `${jobDate} to ${day}`);
  }
});

test('today in Manila is the same on the browser side and the server side', async () => {
  const { manilaTodayKey } = await load();
  [Date.UTC(2026, 9, 20, 15, 59), Date.UTC(2026, 9, 20, 16, 0), Date.now()].forEach((t) => {
    assert.equal(manilaTodayKey(t), serverToday(new Date(t)));
  });
  assert.equal(manilaTodayKey(Date.UTC(2026, 9, 20, 15, 59)), '2026-10-20');
  assert.equal(manilaTodayKey(Date.UTC(2026, 9, 20, 16, 0)), '2026-10-21'); // midnight in Manila
});
