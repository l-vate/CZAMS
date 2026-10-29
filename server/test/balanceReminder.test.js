'use strict';
// Run with: npm test (inside server/). A completed booking reminds the customer to pay the balance, and the sign in and registration pages have the
// small Back link on a tablet or a phone. These read the page sources (the pages need a browser and a server to run).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = (...f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...f), 'utf8').replace(/\r\n/g, '\n');

test('a completed booking with a balance still to pay shows the reminder with a Pay Balance button', () => {
  const page = src('pages', 'customer', 'book_details.jsx');
  assert.match(page, /const balanceDue = booking\.status === BOOKING_STATUS\.COMPLETED && booking\.paymentStatus === PAYMENT_STATUS\.PARTIALLY_PAID/);
  assert.match(page, /!booking\.balancePaid[^\n]*BALANCE_PAYMENT_STATUS\.PAID[^\n]*BALANCE_PAYMENT_STATUS\.TO_VERIFY[^\n]*remaining > 0/, 'not when paid, not when waiting to be verified, not when nothing is left');
  assert.match(page, /\{balanceDue && \(\s*<section className="balance-reminder" role="status"/);
  assert.match(page, /Your service is complete\. Please pay your balance\./);
  assert.match(page, /Remaining balance: <strong>\{formatPeso\(remaining\)\}<\/strong>/);
  assert.match(page, /Pay Balance/);
});

test('Pay Balance opens the payment window for the balance and sends it to the balance route', () => {
  const page = src('pages', 'customer', 'book_details.jsx');
  assert.match(page, /onClick=\{\(\) => \{ setPayingBalance\(true\); setShowPay\(true\); \}\}/);
  assert.match(page, /paymentType=\{payingBalance \? 'balance' : 'downpayment'\}/);
  assert.match(page, /await \(payingBalance \? submitBalancePayment : submitPayment\)\(booking\.bookingId, proof, referenceNumber\)/);
  assert.match(page, /onClose=\{\(\) => \{ setShowPay\(false\); setPayingBalance\(false\); \}\}/, 'closing the window forgets it was for the balance');
});

test('once the balance is sent the reminder gives way to a note that it is being checked', () => {
  const page = src('pages', 'customer', 'book_details.jsx');
  assert.match(page, /const balanceToVerify = booking\.status === BOOKING_STATUS\.COMPLETED && booking\.balancePaymentStatus === BALANCE_PAYMENT_STATUS\.TO_VERIFY/);
  assert.match(page, /Your balance payment was sent\./);
});

test('the reminder stacks on a phone with a full width button', () => {
  const css = src('css', 'customer.css');
  assert.match(css, /\.balance-reminder \{[^}]*display: flex[^}]*justify-content: space-between/);
  assert.match(css, /@media \(max-width: 600px\) \{\s*\.balance-reminder \{ flex-direction: column;[^}]*\}\s*\.balance-reminder-btn \{ width: 100%; \}/);
});

test('the sign in and registration pages have a small Back link that a desktop does not show', () => {
  assert.match(src('pages', 'public', 'login_page.jsx'), /backTo=\{null\} smallBackTo="\/"/);
  assert.match(src('pages', 'public', 'register_page.jsx'), /backTo=\{null\} smallBackTo="\/login"/);
  const shell = src('components', 'auth_shell.jsx');
  assert.match(shell, /!backTo && smallBackTo && \(\s*<header className="ap-top ap-top--small">/);
  assert.match(shell, /className="ap-back ap-back--small"[^>]*>[^<]*<FiArrowLeft aria-hidden="true" \/> Back</);
  const css = src('css', 'auth.css');
  assert.match(css, /@media \(min-width: 1024px\) \{ \.ap-top--small \{ display: none; \} \}/);
  assert.match(css, /\.ap-back--small \{[^}]*min-height: 34px[^}]*font-size: 13px/);
  assert.match(css, /\.ap-back--small::after \{[^}]*inset: -5px/, 'the tap area is still 44 px tall');
});
