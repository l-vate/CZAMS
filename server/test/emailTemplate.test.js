const test = require('node:test');
const assert = require('node:assert/strict');
const { renderNotificationEmail } = require('../utils/emailTemplate');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');

test('the email has a headline for what happened, the message and the booking number', () => {
  const { html, text } = renderNotificationEmail({
    type: NOTIFICATION_TYPE.BOOKING_APPROVED,
    message: 'Your booking CZ-2026-9612 for Deep Cleaning has been approved.',
  });
  assert.match(html, /Booking approved/);
  assert.match(html, /Booking number/);
  assert.match(html, /CZ-2026-9612/);
  assert.match(text, /Booking number: CZ-2026-9612/);
  assert.match(text, /Sign in to your account/);
});

test('the message is escaped, so a name or note cannot add markup to the email', () => {
  const { html } = renderNotificationEmail({ type: 'a_kind_nobody_has_made_yet', message: '<script>alert(1)</script> & more' });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Update from CZAMS/);
});

test('the Open CZAMS button appears only for a real web address', () => {
  const type = NOTIFICATION_TYPE.PAYMENT_VERIFIED;
  assert.match(renderNotificationEmail({ type, message: 'Paid.', appUrl: 'https://czams.example.com' }).html, /Open CZAMS/);
  assert.ok(!renderNotificationEmail({ type, message: 'Paid.' }).html.includes('Open CZAMS'));
  assert.ok(!renderNotificationEmail({ type, message: 'Paid.', appUrl: 'javascript:alert(1)' }).html.includes('Open CZAMS'));
});
