// Run with: npm test (inside server/). The customer dashboard's "Ongoing Service" counts only bookings that are In Progress, the same as the In Progress tab of
// My Bookings: an Approved booking is upcoming, not ongoing. Reads the page source; nothing connects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Ongoing Service on the customer dashboard counts In Progress only, not Approved', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'customer', 'dashboard.jsx'), 'utf8');
  assert.match(source, /ongoing: bookings\.filter\(\(b\) => b\.status === BOOKING_STATUS\.IN_PROGRESS\)\.length/);
  assert.doesNotMatch(source, /\[BOOKING_STATUS\.APPROVED, BOOKING_STATUS\.IN_PROGRESS\]/);
});
