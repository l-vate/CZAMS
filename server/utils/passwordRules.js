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

module.exports = { validateNewPassword, MIN_PASSWORD_LENGTH };
