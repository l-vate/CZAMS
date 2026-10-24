// Run with: npm test (inside server/). What a customer reads for a date or block that cannot be booked, on the landing calendar and in the
// booking date pickers (src/utils/availabilityText.js and the two calendars). No database; the pure helpers are imported, the components are
// checked as source because the project has no browser test runner.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..', 'src');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = () => import(pathToFileURL(path.join(root, 'utils', 'availabilityText.js')).href);

test('a closed day reads "Closed: <reason>", a Sunday "Closed: Sunday", and is never empty or undefined', async () => {
  const t = await load();
  assert.equal(t.closedWords('Holiday'), 'Closed: Holiday');
  assert.equal(t.closedWords('  Christmas Day  '), 'Closed: Christmas Day');
  assert.equal(t.closedWords(''), 'Closed: Shop closed');
  assert.equal(t.closedWords(undefined), 'Closed: Shop closed');
  assert.equal(t.closedWords(null), 'Closed: Shop closed');
  assert.equal(t.closedDayText({ status: 'closed' }), 'Closed: Sunday');
  assert.equal(t.closedDayText({ status: 'shop-closed', reason: 'Holiday' }), 'Closed: Holiday');
  assert.equal(t.closedDayText({ status: 'shop-closed', reason: 'Holiday', closedLabel: 'Closed: Holiday' }), 'Closed: Holiday');
  assert.equal(t.closedDayText({ status: 'shop-closed' }), 'Closed: Shop closed');
  ['undefined', 'null', '[object'].forEach((word) => assert.equal(t.closedDayText({ status: 'shop-closed', reason: undefined }).includes(word), false));
});

test('a block says why it is not available: no technicians, or fully booked', async () => {
  const t = await load();
  assert.equal(t.blockLabel(true, null), 'Available');
  assert.equal(t.blockLabel(false, 'noTechnicians'), 'No technicians available');
  assert.equal(t.blockLabel(false, 'fullyBooked'), 'Fully booked');
  assert.equal(t.blockLabel(false, undefined), 'Fully booked', 'an answer without reasons reads as before');
});

test('the day detail names each block, and the picker message is one phrase when both blocks have the same reason', async () => {
  const t = await load();
  const noTech = { status: 'full', morning: false, afternoon: false, morningReason: 'noTechnicians', afternoonReason: 'noTechnicians', reasonCode: 'noTechnicians' };
  assert.equal(t.blocksText(noTech), 'Morning: No technicians available · Afternoon: No technicians available');
  assert.equal(t.takenDayText(noTech), 'No technicians available');
  const booked = { status: 'full', morning: false, afternoon: false, morningReason: 'fullyBooked', afternoonReason: 'fullyBooked', reasonCode: 'fullyBooked' };
  assert.equal(t.takenDayText(booked), 'Fully booked');
  const mixed = { status: 'full', morning: false, afternoon: false, morningReason: 'noTechnicians', afternoonReason: 'fullyBooked', reasonCode: 'fullyBooked' };
  assert.equal(t.takenDayText(mixed), 'Morning: No technicians available · Afternoon: Fully booked');
  const limited = { status: 'limited', morning: false, afternoon: true, morningReason: 'noTechnicians', afternoonReason: null };
  assert.equal(t.blocksText(limited), 'Morning: No technicians available · Afternoon: Available');
});

test('only a day with no technicians in either block gets the neutral look; fully booked keeps its own', async () => {
  const t = await load();
  assert.equal(t.dayLook({ status: 'full', reasonCode: 'noTechnicians' }), 'no-technicians');
  assert.equal(t.dayLook({ status: 'full', reasonCode: 'fullyBooked' }), 'full');
  assert.equal(t.dayLook({ status: 'full' }), 'full');
  assert.equal(t.dayLook({ status: 'limited', morningReason: 'noTechnicians' }), 'limited');
  assert.equal(t.dayLook({ status: 'shop-closed' }), 'shop-closed');
  assert.equal(t.dayLook(undefined), 'past');
});

test('the landing legend has an entry for No technicians available, with its own swatch', () => {
  const content = read('config/landingContent.js');
  assert.match(content, /\{ status: 'no-technicians', label: 'No technicians available' \}/);
  assert.match(read('css/components/availability.css'), /\.avail-day--no-technicians \{/);
  assert.match(read('css/landing_extras.css'), /\.lp-root \.avail-day--no-technicians \{/, 'the dark landing page has its own readable colors for it');
  assert.match(read('css/landing_extras.css'), /\.lp-root \.avail-tip \{/);
});

test('the landing calendar gives every day an accessible label with its message, and a message on hover and focus, not only a title', () => {
  const source = read('components/availability_calendar.jsx');
  assert.match(source, /aria-label=\{`\$\{Number\(key\.slice\(8\)\)\} \$\{monthLabel\}: /);
  assert.match(source, /className="avail-tip"/);
  assert.equal(/\stitle=/.test(source), false, 'the title attribute is not relied on');
  assert.equal(/'Fully booked'/.test(source.replace(/full: 'Fully booked',/, '')), false, 'a block never says Fully booked by itself: the reason decides');
  assert.match(read('css/components/availability.css'), /\.avail-cell:has\(\.avail-day:focus-visible\) \.avail-tip/);
});

test('the booking date pickers keep unavailable days focusable, say why on hover, focus and tap, and list no closed dates for a customer', () => {
  const source = read('components/closure_date_input.jsx');
  assert.match(source, /aria-disabled=\{problem \? 'true' : undefined\}/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /className="date-picker-tip"/);
  assert.match(source, /className="date-picker-note" role="status"/);
  assert.equal(/\stitle=/.test(source), false, 'the title attribute is not relied on');
  assert.equal(/disabled=\{Boolean\(problem\)\}/.test(source), false, 'a disabled button fires no hover or focus, so the days are aria-disabled instead');
  assert.match(source, /showClosedList && closures\.length > 0/);
  assert.match(read('pages/customer/book_service.jsx'), /showClosedList=\{false\}/);
  assert.match(read('pages/customer/book_details.jsx'), /showClosedList=\{false\}/);
  assert.match(read('css/components/closures.css'), /\.date-picker-cell:has\(\.date-picker-day:focus-visible\) \.date-picker-tip/);
  assert.match(read('css/components/closures.css'), /\.date-picker-day--no-technicians \{/);
});

test('no customer page prints the sentence that lists closed dates', () => {
  ['pages/customer/book_service.jsx', 'pages/customer/book_details.jsx', 'components/availability_calendar.jsx', 'pages/public/landing_page.jsx'].forEach((file) => {
    assert.equal(/and \$\{closures\.length - 4\} more|closures\.slice\(0, 4\)/.test(read(file)), false, `${file} lists closed dates`);
  });
  // the only place that can list them is the picker itself, and only when a page asks for it (the admin pages)
  const source = read('components/closure_date_input.jsx');
  assert.equal((source.match(/closures\.slice\(0, 4\)/g) || []).length, 1);
  assert.match(source, /showClosedList = true/);
});
