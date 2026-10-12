// Run with: npm test (inside server/). Tests the session helpers that the route guard and the API
// client use. They have no browser-only imports, so they run in Node.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'session.js')).href);

const session = (role) => ({ token: 't', user: { role } });

test('no session sends every role area to the login page', async () => {
  const { redirectFor } = await load();
  ['admin', 'staff', 'customer'].forEach((role) => {
    assert.equal(redirectFor({ token: null, user: null }, role), '/login');
    assert.equal(redirectFor(null, role), '/login');
    assert.equal(redirectFor({ token: 't', user: null }, role), '/login');
  });
});

test('a technician on admin or customer pages goes to the technician dashboard', async () => {
  const { redirectFor } = await load();
  assert.equal(redirectFor(session('staff'), 'admin'), '/staff/dashboard');
  assert.equal(redirectFor(session('staff'), 'customer'), '/staff/dashboard');
});

test('and the reverse for each role', async () => {
  const { redirectFor } = await load();
  assert.equal(redirectFor(session('admin'), 'staff'), '/admin/dashboard');
  assert.equal(redirectFor(session('admin'), 'customer'), '/admin/dashboard');
  assert.equal(redirectFor(session('customer'), 'staff'), '/customer/dashboard');
  assert.equal(redirectFor(session('customer'), 'admin'), '/customer/dashboard');
});

test('the right role stays where it is', async () => {
  const { redirectFor } = await load();
  ['admin', 'staff', 'customer'].forEach((role) => assert.equal(redirectFor(session(role), role), null));
});

test('an expired token (401) ends the session, but only for a request that carried a token', async () => {
  const { sessionEndMessage } = await load();
  assert.match(sessionEndMessage(401, 'Invalid or expired token', true), /session has expired/);
  assert.equal(sessionEndMessage(401, 'Invalid email or password', false), null); // a wrong password at login
});

test('a deactivated account (403) ends the session with the server message', async () => {
  const { sessionEndMessage } = await load();
  const message = 'This account has been deactivated. Please contact the administrator.';
  assert.equal(sessionEndMessage(403, message, true), message);
});

test('an ordinary 403 or other error does not end the session', async () => {
  const { sessionEndMessage } = await load();
  assert.equal(sessionEndMessage(403, 'Forbidden', true), null);
  assert.equal(sessionEndMessage(404, 'Not found', true), null);
  assert.equal(sessionEndMessage(500, 'Server error', true), null);
  assert.equal(sessionEndMessage(400, 'Current password is incorrect', true), null);
});
