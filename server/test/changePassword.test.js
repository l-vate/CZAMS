// Run with: npm test (inside server/). The basic new-password rules (registration and reset build on them).
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateNewPassword } = require('../utils/passwordRules');

// ---- the rules on their own
test('a new password is required, a string, and at least 8 characters', () => {
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1' }).message, /required/);
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: '' }).message, /required/);
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: 12345678 }).message, /required/);
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: { $ne: '' } }).message, /required/);
  assert.match(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: 'short' }).message, /at least 8 characters/);
  assert.equal(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: '1234567' }).status, 400);
});

test('it must differ from the current password', () => {
  assert.match(validateNewPassword({ currentPassword: 'samepassword', newPassword: 'samepassword' }).message, /different/);
});

test('a good password passes', () => {
  assert.equal(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: 'a-better-one-9' }), null);
  assert.equal(validateNewPassword({ currentPassword: 'oldpassword1', newPassword: '12345678' }), null); // exactly 8
});
