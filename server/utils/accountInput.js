// What a person types when they register or edit their profile, checked on the server (the form checks too, but a
// form can be skipped). Pure apart from findUserByEmail, which takes the User model, so the rules are tested without
// a database.
const { invalid } = require('./validation');
const { validateNewPassword } = require('./passwordRules');
const { normalizeContactNumber } = require('./contactNumber');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 50;

const text = (v) => (typeof v === 'string' ? v.trim() : '');

// Stored form of an email: trimmed and lower case.
const normalizeEmail = (v) => text(v).toLowerCase();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The account with this email, found without regard to letter case, so an account saved as "Ana@Mail.com" before emails
// were stored lower case is still found. `User` is the Mongoose model. `exceptId` leaves one account out (a person
// changing their own email).
function findUserByEmail(User, email, exceptId) {
  const filter = { email: new RegExp(`^${escapeRegex(text(email))}$`, 'i') };
  if (exceptId) filter._id = { $ne: exceptId };
  return User.findOne(filter);
}

function nameProblem(firstName, lastName) {
  const first = text(firstName);
  const last = text(lastName);
  if (!first) return invalid('First name is required.');
  if (!last) return invalid('Last name is required.');
  if (first.length > NAME_MAX || last.length > NAME_MAX) return invalid(`Each name must be ${NAME_MAX} characters or fewer.`);
  return null;
}

function emailProblem(email) {
  const value = text(email);
  if (!value) return invalid('Email is required.');
  if (value.length > 254 || !EMAIL_PATTERN.test(value)) return invalid('Enter a valid email address.');
  return null;
}

function phoneProblem(phone, { required }) {
  if (text(phone) === '') return required ? invalid('A contact number is required.') : null;
  return normalizeContactNumber(phone) ? null : invalid('Enter a valid contact number (7 to 15 digits).');
}

// null when a new account's details are acceptable, otherwise { status, message }.
function validateRegistration({ firstName, lastName, email, phone, password }) {
  return nameProblem(firstName, lastName)
    || emailProblem(email)
    || phoneProblem(phone, { required: true })
    || validateNewPassword({ newPassword: password });
}

// null when an edited profile is acceptable. A blank phone or address keeps what is saved.
function validateProfileUpdate({ firstName, lastName, email, phone }) {
  return nameProblem(firstName, lastName) || emailProblem(email) || phoneProblem(phone, { required: false });
}

module.exports = { normalizeEmail, findUserByEmail, validateRegistration, validateProfileUpdate, EMAIL_PATTERN, NAME_MAX };
