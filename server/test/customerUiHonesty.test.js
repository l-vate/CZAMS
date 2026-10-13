// Run with: npm test (inside server/). Checks that need no browser, for the customer screens: no browser alert() is left,
// no Email or SMS "Coming soon" card promises what the paper does not, the delete-account text matches what the server
// does, a failed load shows an error with Retry instead of an empty list, the chat shows a connection problem and
// recovers, and chat and reminder notifications open something. How it looks and feels still needs a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const src = (...p) => path.join(__dirname, '..', '..', 'src', ...p);
const read = (...p) => fs.readFileSync(src(...p), 'utf8');
const CUSTOMER_PAGES = ['billings', 'book_details', 'book_service', 'my_bookings', 'profile', 'dashboard', 'chat', 'customer_layout'];

test('no customer screen uses a browser alert()', () => {
  CUSTOMER_PAGES.forEach((page) => assert.doesNotMatch(read('pages', 'customer', `${page}.jsx`), /\balert\(/, page));
  assert.doesNotMatch(read('components', 'chat_panel.jsx'), /\balert\(/);
});

test('every page that showed an alert now shows a notice instead', () => {
  ['billings', 'book_details', 'book_service', 'my_bookings', 'profile'].forEach((page) => {
    const code = read('pages', 'customer', `${page}.jsx`);
    assert.match(code, /useNotice\(\)/, page);
    assert.match(code, /<Notice message=\{notice\} onClose=\{clearNotice\} \/>/, page);
    assert.match(code, /showNotice\(/, page);
  });
});

test('the booking confirmation no longer shows Email or SMS "Coming soon" cards', () => {
  const code = read('pages', 'customer', 'book_details.jsx');
  assert.doesNotMatch(code, /Email notification/);
  assert.doesNotMatch(code, /SMS notification/);
  assert.doesNotMatch(code, /Coming soon/);
  assert.match(code, /In-app notification/);
});

test('the delete-account text says what the server does', () => {
  const code = read('pages', 'customer', 'profile.jsx');
  assert.doesNotMatch(code, /permanently removed/);
  assert.match(code, /past\s+bookings, invoices and service reports stay as company records/);
  assert.match(code, /active booking, an\s+unsettled refund or a claim waiting for review/);
});

test('my bookings, billings and the dashboard show an error with Retry when the load fails, not an empty list', () => {
  ['my_bookings', 'billings', 'dashboard'].forEach((page) => {
    const code = read('pages', 'customer', `${page}.jsx`);
    assert.doesNotMatch(code, /orFallback\(listMyBookings/, `${page} must not turn a failure into []`);
    assert.match(code, /<LoadError message=/, page);
    assert.match(code, /onRetry=\{retry\}/, page);
    assert.match(code, /setFailed\(true\)/, page);
  });
});

test('the chat panel shows a connection problem when a refresh fails and clears it when one works', () => {
  const code = read('components', 'chat_panel.jsx');
  assert.match(code, /\.catch\(\(\) => setConnectionProblem\(true\)\)/);
  assert.match(code, /setConnectionProblem\(false\)/);
  assert.match(code, /Connection problem/);
  assert.doesNotMatch(code, /orFallback/);
});

test('the stale "team" comment is gone from My Bookings', () => {
  assert.doesNotMatch(read('pages', 'customer', 'my_bookings.jsx'), /every assigned team/);
});

test('chat and reminder notifications open something; a booking notification opens the booking', async () => {
  const { customerNotificationTarget } = await import(pathToFileURL(src('utils', 'notificationTarget.js')).href);
  assert.equal(customerNotificationTarget({ type: 'chat_message' }), '/customer/chat');
  assert.equal(customerNotificationTarget({ type: 'service_reminder', relatedBookingId: null }), '/customer/book_service');
  assert.equal(customerNotificationTarget({ type: 'booking_approved', relatedBookingId: 'CZ-2026-1234' }), '/customer/book_details/CZ-2026-1234');
  assert.equal(customerNotificationTarget({ type: 'chat_message', relatedBookingId: 'CZ-1' }), '/customer/chat', 'a chat message always opens Chat');
  assert.equal(customerNotificationTarget({ type: 'something_else' }), null);
  assert.equal(customerNotificationTarget(null), null);
  assert.equal(customerNotificationTarget({ type: 'booking_approved', relatedBookingId: 'a/b' }), '/customer/book_details/a%2Fb', 'the id is encoded');
});

test('the layout uses that one function for the bell', () => {
  assert.match(read('pages', 'customer', 'customer_layout.jsx'), /customerNotificationTarget\(notification\)/);
});
