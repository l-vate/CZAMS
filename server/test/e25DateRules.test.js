// Run with: npm test (inside server/). E25 date rules (utils/dateRules.js and its browser copy src/utils/dateRules.js). Every boundary is checked with a
// fixed clock (Manila 2026-10-30, a Friday), never the real date or weekday: the day before the minimum, exactly the minimum, exactly the maximum and
// one day after it. The routes are checked with dates worked out from the same functions, so they do not depend on the day the tests run.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./helpers/createBooking');
const { startSsrServer } = require('./helpers/viteSsr');
const rules = require('../utils/dateRules');
const scheduling = require('../constants/scheduling');
const { readClosureInput } = require('../utils/closures');
const { readOffInput } = require('../utils/technicianOff');
const { validateReportInput } = require('../utils/reportErrors');

const NOW = new Date('2026-10-30T02:00:00Z'); // 10:00 on 30 Oct 2026 in Manila
const TODAY = '2026-10-30';

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); harness.install(); });
after(async () => { await closeVite(); await harness.close(); });

const src = (file) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', file), 'utf8');

test('the constants are in one file', () => {
  const json = require('../constants/dateRules.json');
  assert.equal(json.bookingMaxMonths, 5);
  assert.equal(json.earliestDate, '2009-01-01');
  assert.equal(json.closureMaxMonths, 5);
  assert.equal(json.leaveMaxMonths, 5);
  assert.equal(rules.BOOKING_MAX_MONTHS, 5);
  assert.equal(rules.EARLIEST_DATE, '2009-01-01');
});

test('booking window: at least 3 days ahead, at most 5 calendar months ahead, in Manila time', () => {
  assert.deepEqual(rules.bookingWindow(NOW), { min: '2026-11-02', max: '2027-03-30' });
  assert.equal(scheduling.MIN_LEAD_DAYS, 3);
  const message = (d) => rules.bookingDateProblem(d, NOW);
  assert.match(message('2026-10-29'), /already passed/, 'yesterday');
  assert.match(message(TODAY), /already passed|at least 3 days/, 'today');
  assert.match(message('2026-11-01'), /at least 3 days notice.*Nov 2, 2026/, 'the day before the minimum');
  assert.equal(message('2026-11-02'), null, 'exactly the minimum');
  assert.equal(message('2027-03-30'), null, 'exactly 5 months ahead');
  assert.match(message('2027-03-31'), /up to 5 months ahead.*Mar 30, 2027/, 'one day after the maximum');
  assert.match(message('2026-02-30'), /real date/);
  assert.match(message('soon'), /real date/);
  assert.match(message(undefined), /real date/);
});

test('"5 months ahead" follows the calendar: the last day of a short month, and the end of the year', () => {
  assert.equal(rules.addMonthsKey('2026-08-31', 6), '2027-02-28');
  assert.equal(rules.addMonthsKey('2026-10-31', 4), '2027-02-28');
  assert.equal(rules.addMonthsKey('2027-08-31', 6), '2028-02-29', 'a leap year');
  assert.equal(rules.addMonthsKey('2026-10-30', 5), '2027-03-30');
  assert.equal(rules.addMonthsKey('2026-12-15', 5), '2027-05-15');
  assert.deepEqual(rules.bookingWindow(new Date('2026-10-31T02:00:00Z')), { min: '2026-11-03', max: '2027-03-31' });
});

test('the day turns over at midnight in Manila, not in UTC', () => {
  // 00:30 on 31 Oct in Manila is still 30 Oct 16:30 in UTC
  const justAfterMidnight = new Date('2026-10-30T16:30:00Z');
  assert.deepEqual(rules.bookingWindow(justAfterMidnight), { min: '2026-11-03', max: '2027-03-31' });
  // 23:30 on 30 Oct in Manila is 15:30 UTC the same day
  assert.deepEqual(rules.bookingWindow(new Date('2026-10-30T15:30:00Z')), { min: '2026-11-02', max: '2027-03-30' });
});

test('dates about things that already happened: from 2009-01-01 up to today', () => {
  const message = (d) => rules.pastDateProblem(d, NOW, 'start date');
  assert.match(message('2008-12-31'), /cannot be before Jan 1, 2009/, 'the day before the minimum');
  assert.equal(message('2009-01-01'), null, 'exactly the minimum');
  assert.equal(message(TODAY), null, 'exactly today');
  assert.match(message('2026-10-31'), /cannot be in the future/, 'tomorrow');
  assert.match(message('not a date'), /real start date/);
  assert.deepEqual(rules.pastWindow(NOW), { min: '2009-01-01', max: TODAY });
});

test('closed dates: from today, at most 5 months ahead', () => {
  assert.deepEqual(rules.closureWindow(NOW), { min: TODAY, max: '2027-03-30' });
  const ok = (date) => readClosureInput({ date, reason: 'Holiday' }, TODAY);
  assert.match(ok('2026-10-29').problem.message, /already passed/);
  assert.equal(ok(TODAY).problem, null, 'today');
  assert.equal(ok('2027-03-30').problem, null, 'exactly the maximum');
  assert.match(ok('2027-03-31').problem.message, /up to 5 months ahead.*Mar 30, 2027/);
  assert.match(ok('2026-13-01').problem.message, /valid date/);
});

test('technician leave: from today, at most 5 months ahead', () => {
  assert.deepEqual(rules.leaveWindow(NOW), { min: TODAY, max: '2027-03-30' });
  const read = (date) => readOffInput({ technicians: ['T1'], date, blocks: ['Morning'], reason: 'Sick leave' }, ['T1'], TODAY);
  assert.match(read('2026-10-29').problem.message, /already passed/);
  assert.equal(read(TODAY).problem, null);
  assert.equal(read('2027-03-30').problem, null);
  assert.match(read('2027-03-31').problem.message, /up to 5 months ahead/);
});

test('a service report follow-up date: not in the past and at most 5 months ahead', () => {
  const check = (followUpDate) => validateReportInput({ laborHours: 2, issueResolution: 'Complete', followUpRequired: true, followUpDate, today: TODAY });
  assert.match(check('2026-10-29').message, /cannot be in the past/);
  assert.equal(check(TODAY), null);
  assert.equal(check('2027-03-30'), null);
  assert.match(check('2027-03-31').message, /at most 5 months ahead/);
});

test('editing a service report whose follow-up date is not being changed is not held against today', () => {
  // the edit route passes a placeholder day when the follow-up is untouched (utils/reportErrors.js)
  const untouched = validateReportInput({ laborHours: 2, issueResolution: 'Complete', followUpRequired: true, followUpDate: '2020-01-01', today: '0000-01-01' });
  assert.equal(untouched, null);
});

test('the browser copy gives the same windows and the same sentences as the server', async () => {
  const client = await vite.ssrLoadModule('/src/utils/dateRules.js');
  assert.equal(client.BOOKING_LEAD_DAYS, scheduling.MIN_LEAD_DAYS, 'the lead time is the same on both sides');
  assert.equal(client.EARLIEST_DATE, rules.EARLIEST_DATE);
  const nows = [NOW, new Date('2026-10-30T16:30:00Z'), new Date('2027-01-31T02:00:00Z'), new Date('2028-02-29T02:00:00Z')];
  const probes = ['2008-12-31', '2009-01-01', '2026-10-29', '2026-10-30', '2026-11-01', '2026-11-02', '2027-03-30', '2027-03-31', '2027-02-30', 'x', '2028-02-29', '2028-07-29'];
  for (const now of nows) {
    for (const [name] of [['booking'], ['closure'], ['leave']]) {
      assert.deepEqual(client[`${name}Window`](now), rules[`${name}Window`](now), `${name} window`);
    }
    assert.deepEqual(client.pastWindow(now), rules.pastWindow(now));
    for (const d of probes) {
      assert.equal(client.bookingDateProblem(d, now), rules.bookingDateProblem(d, now), `booking ${d}`);
      assert.equal(client.closureDateProblem(d, now), rules.closureDateProblem(d, now), `closure ${d}`);
      assert.equal(client.leaveDateProblem(d, now), rules.leaveDateProblem(d, now), `leave ${d}`);
      assert.equal(client.pastDateProblem(d, now, 'end date'), rules.pastDateProblem(d, now, 'end date'), `past ${d}`);
    }
  }
  assert.match(client.pastRangeProblem('2026-05-01', '2026-04-01', NOW), /end date cannot be before the start date/);
  assert.match(client.pastRangeProblem('2008-01-01', '', NOW), /start date cannot be before/);
  assert.equal(client.pastRangeProblem('2026-01-01', '2026-10-30', NOW), null);
});

// ---- the routes
const { state, post, call, addBooking } = harness;
const clean = { _id: 'S-CLN', name: 'Regular Cleaning', serviceType: 'Cleaning', price: 800, isActive: true };
const users = [
  { _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' },
  { _id: 'ADM1', role: 'admin', isActive: true, name: 'Admin' },
  { _id: 'STF1', role: 'staff', isActive: true, name: 'Tech', position: 'Technician' },
];
const asAdmin = { role: 'admin' };
const book = (date, as = 'CUS1', opts) => post({ service: 'S-CLN', date, units: [{ type: 'Split Type', quantity: 1, hp: '1' }] }, as, opts);
const window = () => rules.bookingWindow(new Date());
const dayAfter = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const NOT_A_DATE_PROBLEM = /months ahead|days notice|already passed|real date/;

test('creating a booking: the day before the minimum and the day after the maximum are refused with the sentence; the edges are not refused for their date', async () => {
  harness.reset({ users, services: [clean] });
  const { min, max } = window();
  const early = await book(dayAfter(min, -1));
  assert.equal(early.status, 400);
  assert.match(early.body.message, /at least 3 days notice|already passed/);
  const late = await book(dayAfter(max, 1));
  assert.equal(late.status, 400);
  assert.match(late.body.message, /up to 5 months ahead/);
  assert.match(late.body.message, new RegExp(rules.bookingWindow().max.slice(0, 4)));
  for (const edge of [min, max]) {
    const res = await book(edge);
    // a Sunday or a full day may still be refused, but never for its date being outside the window
    assert.doesNotMatch((res.body && res.body.message) || '', NOT_A_DATE_PROBLEM, `${edge}: ${res.status}`);
  }
});

test('an admin booking a walk-in is held to the same window', async () => {
  harness.reset({ users, services: [clean] });
  const { max } = window();
  const late = await post({ customer: 'CUS1', service: 'S-CLN', date: dayAfter(max, 1), units: [{ type: 'Split Type', quantity: 1, hp: '1' }] }, 'ADM1', asAdmin);
  assert.equal(late.status, 400);
  assert.match(late.body.message, /up to 5 months ahead/);
});

test('a customer reschedule request: same window, same sentences', async () => {
  harness.reset({ users, services: [clean] });
  addBooking({ bookingId: 'CZ-1', customer: 'CUS1', service: clean, status: 'Pending', date: window().min, time: 'Morning', units: [{ type: 'Split Type', quantity: 1 }], assignments: [] });
  const { min, max } = window();
  const early = await call('PATCH', '/CZ-1/reschedule', 'CUS1', { date: dayAfter(min, -1), time: 'Morning' });
  assert.equal(early.status, 400);
  assert.match(early.body.message, /at least 3 days notice|already passed/);
  const late = await call('PATCH', '/CZ-1/reschedule', 'CUS1', { date: dayAfter(max, 1), time: 'Morning' });
  assert.equal(late.status, 400);
  assert.match(late.body.message, /up to 5 months ahead/);
  const edge = await call('PATCH', '/CZ-1/reschedule', 'CUS1', { date: max, time: 'Morning' });
  assert.doesNotMatch((edge.body && edge.body.message) || '', NOT_A_DATE_PROBLEM);
});

test('the admin reschedule, the disruption reschedule and the no show reschedule skip the 3 day minimum: only the past and 5 months apply', async () => {
  harness.reset({ users, services: [clean] });
  addBooking({ bookingId: 'CZ-2', customer: 'CUS1', service: clean, status: 'Approved', date: window().min, time: 'Morning', units: [{ type: 'Split Type', quantity: 1 }], assignments: [], disruption: { status: 'Reported', reason: 'rain' } });
  const { min: today, max } = rules.adminRescheduleWindow(new Date());
  const useDate = (date) => call('PATCH', '/CZ-2/reschedule/use-date', 'ADM1', { date, time: 'Morning' }, asAdmin);
  const disruption = (date) => call('PATCH', '/CZ-2/disruption/reschedule', 'ADM1', { date, time: 'Morning' }, asAdmin);
  state.bookings[0].noShow = { status: 'Reported' };
  const noShow = (date) => call('PATCH', '/CZ-2/no-show/decision', 'ADM1', { action: 'reschedule', date, time: 'Morning', reason: 'We were late' }, asAdmin);
  for (const [name, move] of [['use-date', useDate], ['disruption', disruption], ['no show', noShow]]) {
    assert.match((await move(dayAfter(today, -1))).body.message, /already passed/, name + ': yesterday');
    assert.match((await move(dayAfter(max, 1))).body.message, /up to 5 months ahead/, name + ': one day after the maximum');
    // tomorrow, today and the maximum are not refused for their date (a Sunday or a clash may still refuse them for its own reason)
    for (const near of [dayAfter(today, 1), today, max]) {
      const res = await move(near);
      assert.doesNotMatch((res.body && res.body.message) || '', /days notice|already passed|months ahead|real date/, name + ': ' + near);
    }
  }
});

test('the admin reschedule window: from today (no 3 day minimum) to 5 months, with the fixed clock', async () => {
  assert.deepEqual(rules.adminRescheduleWindow(NOW), { min: TODAY, max: '2027-03-30' });
  const message = (d) => rules.adminRescheduleDateProblem(d, NOW);
  assert.match(message('2026-10-29'), /already passed.*Oct 30, 2026/, 'the day before the minimum');
  assert.equal(message(TODAY), null, 'exactly the minimum, today');
  assert.equal(message('2026-10-31'), null, 'tomorrow');
  assert.equal(message('2027-03-30'), null, 'exactly the maximum');
  assert.match(message('2027-03-31'), /up to 5 months ahead.*Mar 30, 2027/, 'one day after');
  assert.match(message('2026-02-30'), /real date/);
  // a customer and a new booking keep both limits
  assert.match(rules.bookingDateProblem('2026-10-31', NOW), /at least 3 days notice/);
  const client = await vite.ssrLoadModule('/src/utils/dateRules.js');
  for (const d of ['2026-10-29', TODAY, '2026-10-31', '2027-03-30', '2027-03-31', 'x']) {
    assert.equal(client.adminRescheduleDateProblem(d, NOW), message(d), d);
  }
  assert.deepEqual(client.adminRescheduleWindow(NOW), rules.adminRescheduleWindow(NOW));
});

test('a booking that is already outside the window is left as it is', async () => {
  harness.reset({ users, services: [clean] });
  const far = dayAfter(window().max, 60);
  addBooking({ bookingId: 'CZ-3', customer: 'CUS1', service: clean, status: 'Pending', date: far, time: 'Morning', units: [{ type: 'Split Type', quantity: 1 }], assignments: [] });
  const view = await call('GET', '/mine', 'CUS1');
  assert.equal(view.body.find((b) => b.bookingId === 'CZ-3').date, far);
  assert.equal(state.bookings[0].date, far);
});

test('the audit log filter takes dates from 2009-01-01 up to today', async () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auditRoutes.js'), 'utf8');
  assert.match(route, /pastDateProblem\(from/);
  assert.match(route, /pastDateProblem\(to/);
});

test('every date input in the app takes its limits and its sentence from the shared rules', () => {
  const uses = {
    'pages/customer/book_service.jsx': /bookingWindow\(\)[\s\S]*bookingDateProblem\(form\.date\)/,
    'pages/customer/book_details.jsx': /bookingWindow\(\)[\s\S]*max=\{maxDate\}[\s\S]*date-problem/,
    'pages/admin/walk_in_booking.jsx': /!bookingDateProblem\(form\.date\)/,
    'components/admin_service_details_modal.jsx': /min=\{adminRescheduleWindow\(\)\.min\}[\s\S]*max=\{adminRescheduleWindow\(\)\.max\}/,
    'components/no_show_panels.jsx': /min=\{adminRescheduleWindow\(\)\.min\}[\s\S]*adminRescheduleDateProblem\(date\)/,
    'components/closure_manager.jsx': /closureDateProblem\(date\)[\s\S]*closureWindow\(\)\.max/,
    'components/technician_availability_manager.jsx': /leaveDateProblem\(date\)[\s\S]*leaveWindow\(\)\.max/,
    'components/statement_of_account.jsx': /pastRangeProblem\(form\.fromKey, form\.toKey\)[\s\S]*pastWindow\(\)\.min/,
    'pages/admin/reports.jsx': /pastWindow\(\)\.max[\s\S]*pastRangeProblem\(filters\.fromKey/,
    'pages/admin/analytics.jsx': /pastWindow\(\)\.max[\s\S]*pastRangeProblem\(range\.fromKey/,
    'pages/admin/audit_log.jsx': /pastRangeProblem\(filters\.from[\s\S]*pastWindow\(\)\.max/,
    'pages/admin/promotions.jsx': /min=\{EARLIEST_DATE\}/,
    'pages/staff/reports.jsx': /addMonthsKey\(todayKey\(\), BOOKING_MAX_MONTHS\)/,
  };
  for (const [file, pattern] of Object.entries(uses)) assert.ok(pattern.test(src(file)), file);
  const picker = src('components/closure_date_input.jsx');
  assert.match(picker, /max && key > max/);
  assert.match(picker, /Too far ahead/);
});
