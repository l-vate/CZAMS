// The rules for a new password on the register form, each with whether the typed password meets it. The form shows them under the field
// and updates them as the person types. The server enforces the same rules (server/utils/passwordRules.js); this is only the live hint.
export const PASSWORD_MIN_LENGTH = 8;

export function passwordChecks(password) {
  const text = typeof password === 'string' ? password : '';
  return [
    { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: text.length >= PASSWORD_MIN_LENGTH },
    { id: 'number', label: 'At least 1 number', met: /\d/.test(text) },
    { id: 'special', label: 'At least 1 special character (for example ! @ # $ %)', met: /[^A-Za-z0-9\s]/.test(text) },
  ];
}

export const passwordIsAcceptable = (password) => passwordChecks(password).every((check) => check.met);
