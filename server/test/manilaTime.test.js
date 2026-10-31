// Run with: npm test (inside server/). Every booking rule that talks about "today", "three days ahead" or "three months
// ago" uses the date in Philippine time (Asia/Manila), whatever time zone the server runs in. The same real routes are
// run in separate Node processes with their own TZ and a frozen clock, including the window between 00:00 and 08:00 in
// Manila, when the server's own date is still the day before. All of them must give the same answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { manilaToday, manilaDateKey, addDaysManila, monthsAgoManila, monthsAgoManilaKey, isAtLeastDaysAhead } = require('../utils/manilaDate');

const CHILD = path.join(__dirname, 'helpers', 'manilaChild.js');
const ZONES = ['UTC', 'Asia/Manila', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

// ---- the helpers on their own
test('the Manila date of an instant, around midnight', () => {
  assert.equal(manilaDateKey('2026-10-13T15:59:59Z'), '2026-10-13');
  assert.equal(manilaDateKey('2026-10-13T16:00:00Z'), '2026-10-14');
  assert.equal(manilaToday(new Date('2026-10-13T19:00:00Z')), '2026-10-14', '03:00 in Manila is already the 14th');
});

test('days and months are counted on Manila calendar days', () => {
  assert.equal(addDaysManila('2026-10-30', 3), '2026-11-02');
  assert.equal(addDaysManila('2026-12-30', 3), '2027-01-02');
  assert.equal(monthsAgoManilaKey(3, new Date('2026-10-13T19:00:00Z')), '2026-07-14');
  assert.equal(monthsAgoManilaKey(12, new Date('2026-10-13T19:00:00Z')), '2025-10-14');
  assert.equal(monthsAgoManilaKey(1, new Date('2026-03-31T04:00:00Z')), '2026-02-28', 'a month with no 31st ends on its last day');
  assert.equal(monthsAgoManilaKey(6, new Date('2026-01-15T00:00:00Z')), '2025-07-15');
  assert.equal(monthsAgoManila(12, new Date('2026-10-13T19:00:00Z')).toISOString(), '2025-10-13T16:00:00.000Z', 'the start of that day in Manila');
});

test('the lead-time rule: three days ahead from Manila today, a real date only', () => {
  const now = new Date('2026-10-13T19:00:00Z'); // 14 October, 03:00 in Manila
  assert.equal(isAtLeastDaysAhead('2026-10-16', 3, now), false, 'two days ahead');
  assert.equal(isAtLeastDaysAhead('2026-10-17', 3, now), true);
  assert.equal(isAtLeastDaysAhead('2026-10-18', 3, now), true);
  assert.equal(isAtLeastDaysAhead('2026-02-31', 3, now), false, 'not a real date');
  assert.equal(isAtLeastDaysAhead('tomorrow', 3, now), false);
  assert.equal(isAtLeastDaysAhead(undefined, 3, now), false);
  assert.equal(isAtLeastDaysAhead('2026-10-17T00:00:00Z', 3, now), false, 'only a plain date');
});

// ---- the real routes, in several time zones
const run = (tz, now) => {
  const result = spawnSync(process.execPath, [CHILD], { env: { ...process.env, TZ: tz, NOW: now }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${tz} ${now}: ${result.stderr}`);
  return JSON.parse(result.stdout.trim().split('\n').pop());
};

const INSTANTS = [
  ['2026-10-13T19:00:00Z', '2026-10-14', 'Manila 03:00, a server in UTC is still on the 13th'],
  ['2026-10-13T23:59:59Z', '2026-10-14', 'Manila 07:59:59'],
  ['2026-10-14T00:30:00Z', '2026-10-14', 'Manila 08:30'],
  ['2026-10-14T15:59:59Z', '2026-10-14', 'Manila 23:59:59'],
  ['2026-10-14T16:00:00Z', '2026-10-15', 'Manila 00:00, the next day'],
];

for (const [now, manilaDay, label] of INSTANTS) {
  test(`${label}: every time zone gives the same answers, and they are the Manila answers`, () => {
    const results = ZONES.map((tz) => ({ tz, ...run(tz, now) }));
    const expected = results.find((r) => r.tz === 'Asia/Manila');
    const strip = ({ tz, ...rest }) => rest; // eslint-disable-line no-unused-vars
    results.forEach((r) => assert.deepEqual(strip(r), strip(expected), `${r.tz} differs from Asia/Manila at ${now}`));
    assert.equal(expected.today, manilaDay);
    assert.equal(expected.createTwoAhead, 400, 'two days ahead is refused');
    assert.equal(expected.createThreeAhead, 201, 'three days ahead is accepted');
    assert.deepEqual(expected.cancelToday, { status: 200, sameDay: true }, 'a booking dated today in Manila is same-day');
    assert.deepEqual(expected.cancelTomorrow, { status: 200, sameDay: false });
  });
}

// ---- the jobs
test('the service reminder runs on Manila time: the cron has the Asia/Manila timezone and the due date is counted in Manila months', () => {
  const fs = require('node:fs');
  const job = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'serviceReminderJob.js'), 'utf8');
  assert.match(job, /\{ timezone: TIMEZONE \}/);
  assert.match(job, /monthsAgoManilaKey\(SERVICE_REMINDER_TRIGGER_MONTHS(, now)?\)/);
  assert.doesNotMatch(job, /setMonth/);
  const classification = fs.readFileSync(path.join(__dirname, '..', 'utils', 'classification.js'), 'utf8');
  assert.match(classification, /monthsAgoManila\(RETURN_CUSTOMER_WINDOW_MONTHS\)/);
  assert.doesNotMatch(classification, /setMonth/);
  assert.equal(require('../utils/timeBlocks').TIMEZONE, 'Asia/Manila');
});
