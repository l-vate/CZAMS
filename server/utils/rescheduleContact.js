// The contact details a customer may change while rescheduling a booking: who to ask for (a name) and the number to call. Both are
// optional. A value that is left out or empty keeps what the booking has. The rules are the booking form's: a name is letters, spaces,
// hyphens, apostrophes and periods; a number is 7 to 15 digits (utils/contactNumber.js). The change belongs to that booking only: the
// customer's own account is never touched. Pure, so it is tested without a database.
const { invalid } = require('./validation');
const { NAME_PATTERN } = require('./accountInput');
const { normalizeContactNumber } = require('./contactNumber');

const CONTACT_NAME_MAX = 100;

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const given = (v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

// null when what was sent is acceptable, otherwise { status, message }.
function contactInputProblem(body) {
  const { contactName, contactNumber } = body || {};
  if (given(contactName)) {
    if (typeof contactName !== 'string') return invalid('Contact name must be text.');
    const name = clean(contactName);
    if (name.length > CONTACT_NAME_MAX) return invalid(`Contact name must be ${CONTACT_NAME_MAX} characters or fewer.`);
    if (!NAME_PATTERN.test(name)) return invalid('Contact name can only have letters, spaces, hyphens, apostrophes and periods.');
  }
  if (given(contactNumber)) {
    if (typeof contactNumber !== 'string' || !normalizeContactNumber(contactNumber)) return invalid('Enter a valid contact number (7 to 15 digits).');
  }
  return null;
}

// `current` is what the booking carries now: { name, number } (the name falls back to the account's own name, the number to the account's phone).
// Returns { changed: false }, or { changed: true, name?, number?, old: { name?, number? } } holding only the values that differ.
function contactChange(body, current) {
  const { contactName, contactNumber } = body || {};
  const out = { changed: false, old: {} };
  if (given(contactName)) {
    const name = clean(contactName);
    if (name !== clean(current && current.name)) { out.changed = true; out.name = name; out.old.name = clean(current && current.name); }
  }
  if (given(contactNumber)) {
    const number = String(contactNumber).trim();
    if (number !== String((current && current.number) || '').trim()) { out.changed = true; out.number = number; out.old.number = String((current && current.number) || '').trim(); }
  }
  return out;
}

// One sentence for the admin's reschedule notice.
function contactChangeSentence(change) {
  const parts = [];
  if (change.name !== undefined) parts.push(`the contact name to ${change.name}`);
  if (change.number !== undefined) parts.push(`the contact number to ${change.number}`);
  return parts.length ? ` The customer also changed ${parts.join(' and ')}.` : '';
}

module.exports = { contactInputProblem, contactChange, contactChangeSentence, CONTACT_NAME_MAX };
