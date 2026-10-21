// The rules for a new password, checked on the server (the form checks them too, but a form can be skipped).
// Returns null when the new password is acceptable, otherwise { status, message }. Pure, and it never
// stores or logs the password.
const MIN_PASSWORD_LENGTH = 8;

const bad = (message) => ({ status: 400, message });

function validateNewPassword({ currentPassword, newPassword }) {
  if (typeof newPassword !== 'string' || newPassword === '') {
    return bad('A new password is required.');
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return bad(`The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (typeof currentPassword === 'string' && newPassword === currentPassword) {
    return bad('The new password must be different from the current one.');
  }
  return null;
}

// A password chosen when registering a new account: the rules above, plus at least one number and one special character.
// Only registration uses it. Existing accounts are not checked against it, and signing in or changing a password is unchanged.
const REGISTRATION_PASSWORD_MESSAGE = `Use a password of at least ${MIN_PASSWORD_LENGTH} characters with at least 1 number and 1 special character.`;

function validateRegistrationPassword(password) {
  const basic = validateNewPassword({ newPassword: password });
  if (basic) return basic;
  if (!/\d/.test(password) || !/[^A-Za-z0-9\s]/.test(password)) return bad(REGISTRATION_PASSWORD_MESSAGE);
  return null;
}

module.exports = { validateNewPassword, validateRegistrationPassword, REGISTRATION_PASSWORD_MESSAGE, MIN_PASSWORD_LENGTH };
