// Run with: npm test (inside server/). Tests the helper that decides where a technician's notification opens.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'notificationTarget.js')).href);

test('a job notification opens that job on My Jobs', async () => {
  const { technicianNotificationTarget } = await load();
  assert.equal(
    technicianNotificationTarget({ type: 'job_assigned', relatedBookingId: 'CZ-2026-6699' }),
    '/staff/my_jobs?job=CZ-2026-6699',
  );
  assert.equal(technicianNotificationTarget({ type: 'job_unassigned', relatedBookingId: 'CZ-2026-6699' }), '/staff/my_jobs?job=CZ-2026-6699');
});

test('a chat message opens Chat, even if it has no booking', async () => {
  const { technicianNotificationTarget } = await load();
  assert.equal(technicianNotificationTarget({ type: 'chat_message', relatedBookingId: null }), '/staff/chat');
});

test('a notification with nothing to open goes nowhere', async () => {
  const { technicianNotificationTarget } = await load();
  assert.equal(technicianNotificationTarget({ type: 'service_reminder', relatedBookingId: null }), null);
  assert.equal(technicianNotificationTarget(null), null);
  assert.equal(technicianNotificationTarget({}), null);
});

test('the booking id is made safe for a web address', async () => {
  const { technicianNotificationTarget } = await load();
  assert.equal(technicianNotificationTarget({ type: 'x', relatedBookingId: 'A B&C' }), '/staff/my_jobs?job=A%20B%26C');
});
