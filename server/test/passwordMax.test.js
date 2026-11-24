// Run with: npm test (inside server/). A new password is at most 20 characters, wherever a password is CHOSEN: registration, password reset and an account an admin creates.
// Signing in has no such limit, so an account made earlier can still sign in. The screens use the same number and show it in their rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');
const { validateNewPassword, validateRegistrationPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } = require('../utils/passwordRules');
const { userInputProblem } = require('../utils/adminInput');
const { validateRegistration } = require('../utils/accountInput');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...p), 'utf8');
const word = (n) => `Ab1!${'x'.repeat(n - 4)}`;

test('the limit is 20, and exactly 20 is still accepted', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(MAX_PASSWORD_LENGTH, 20);
  assert.equal(word(20).length, 20);
  assert.equal(validateNewPassword({ newPassword: word(20) }), null);
  assert.equal(validateRegistrationPassword(word(20)), null);
  assert.equal(validateRegistrationPassword(word(8)), null);
});

test('21 characters is refused for a new password, a registration and an account an admin creates, with a message that says 20', () => {
  assert.match(validateNewPassword({ newPassword: word(21) }).message, /at most 20 characters/);
  const registration = validateRegistrationPassword(word(21));
  assert.equal(registration.status, 400);
  assert.match(registration.message, /at most 20 characters/);
  assert.match(validateRegistration({ firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.test', phone: '09171234567', password: word(21) }).message, /20 at most|at most 20/);
  assert.match(userInputProblem({ password: word(21) }, { creating: false }).message, /at most 20 characters/);
  assert.equal(userInputProblem({ password: word(20) }, { creating: false }), null);
  assert.match(validateNewPassword({ newPassword: 'short' }).message, /at least 8 characters/, 'the lower limit is unchanged');
});

test('signing in is not limited: the login route never checks the length of a password', () => {
  const auth = fs.readFileSync(path.join(__dirname, '..', 'routes', 'authRoutes.js'), 'utf8');
  const login = auth.slice(auth.indexOf("router.post('/login'"), auth.indexOf("router.post('/login'") + 1500);
  assert.doesNotMatch(login, /MAX_PASSWORD_LENGTH|validateNewPassword|validateRegistrationPassword/);
  assert.doesNotMatch(read('pages', 'public', 'login_page.jsx'), /maxLength/);
});

test('the screens use the same number: the rule list says 8 to 20, 21 characters does not pass, and the new password boxes stop at 20', async () => {
  const { vite, close } = await startSsrServer();
  const checks = await vite.ssrLoadModule('/src/utils/passwordChecks.js').finally(close);
  assert.equal(checks.PASSWORD_MAX_LENGTH, MAX_PASSWORD_LENGTH);
  assert.equal(checks.PASSWORD_MIN_LENGTH, MIN_PASSWORD_LENGTH);
  assert.equal(checks.passwordChecks(word(10)).find((c) => c.id === 'length').label, '8 to 20 characters');
  assert.equal(checks.passwordIsAcceptable(word(20)), true);
  assert.equal(checks.passwordIsAcceptable(word(21)), false);
  assert.equal(checks.passwordIsAcceptable(word(7)), false);
  assert.equal(read('pages', 'public', 'register_page.jsx').split('maxLength={PASSWORD_MAX_LENGTH}').length - 1, 2, 'password and confirm password on the register page');
  assert.equal(read('pages', 'public', 'reset_password_page.jsx').split('maxLength={PASSWORD_MAX_LENGTH}').length - 1, 2, 'new password and confirm on the reset page');
});
