// What an admin types when they create or change accounts, services and announcements, checked on the server. Every rule
// returns null when the input is fine, otherwise { status, message } (a 400 that names the field). Pure, so it is tested
// without a database. Types are checked first: a value of the wrong kind (an object, an array, the text "false" where a
// true or false is needed) is refused, never coerced.
const { ROLE_VALUES } = require('../constants/roles');
const { SERVICE_TYPE_VALUES, SERVICE_TYPE } = require('../constants/serviceTypes');
const { invalid } = require('./validation');
const { EMAIL_PATTERN, NAME_MAX } = require('./accountInput');
const { normalizeContactNumber } = require('./contactNumber');
const { MIN_PASSWORD_LENGTH } = require('./passwordRules');

const isText = (v) => typeof v === 'string';
const has = (v) => v !== undefined;

// ---- accounts
// `creating` is true for a new account, where the email is required. A password is only checked when one is set.
function userInputProblem(body, { creating }) {
  const { name, email, phone, address, role, password, isActive, clientType } = body || {};
  if (has(name) && (!isText(name) || name.trim().length > NAME_MAX * 2)) return invalid(`The name must be text of ${NAME_MAX * 2} characters or fewer.`);
  if (creating || has(email)) {
    if (!isText(email) || !email.trim()) return invalid('Email is required.');
    if (email.trim().length > 254 || !EMAIL_PATTERN.test(email.trim())) return invalid('Enter a valid email address.');
  }
  if (has(phone) && phone !== '' && (!isText(phone) || !normalizeContactNumber(phone))) return invalid('Enter a valid contact number (7 to 15 digits).');
  if (has(address) && (!isText(address) || address.trim().length > 300)) return invalid('The address must be text of 300 characters or fewer.');
  if (has(role) && (!isText(role) || !ROLE_VALUES.includes(role))) return invalid(`The role must be one of: ${ROLE_VALUES.join(', ')}.`);
  if (has(isActive) && typeof isActive !== 'boolean') return invalid('Active must be true or false.');
  if (has(clientType) && clientType !== '' && !['Residential', 'Commercial'].includes(clientType)) return invalid('Client type must be Residential or Commercial.');
  if (has(password) && password !== '' && password !== null) {
    if (!isText(password) || password.length < MIN_PASSWORD_LENGTH) return invalid(`A password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password.length > 200) return invalid('That password is too long.');
  }
  return null;
}

// ---- services
const PRICE_MAX = 1000000;
const toNumber = (v) => (typeof v === 'number' ? v : (isText(v) && v.trim() !== '' ? Number(v) : NaN));

function priceProblem(value, label) {
  const price = toNumber(value);
  if (!Number.isFinite(price) || price <= 0) return invalid(`${label} must be a number greater than 0.`);
  if (price > PRICE_MAX) return invalid(`${label} cannot be more than ${PRICE_MAX.toLocaleString()}.`);
  return null;
}

// `creating` makes the name and the price required. Returns { problem, values }: values hold what to store, cleaned.
function serviceInputProblem(body, { creating, current } = {}) {
  const b = body || {};
  const out = {};
  if (creating || has(b.name)) {
    if (!isText(b.name) || !b.name.trim()) return { problem: invalid(creating ? 'Name is required.' : 'Name cannot be empty.') };
    if (b.name.trim().length > 80) return { problem: invalid('The name must be 80 characters or fewer.') };
    out.name = b.name.trim();
  }
  if (creating || has(b.price)) {
    const problem = priceProblem(b.price, 'The price');
    if (problem) return { problem };
    out.price = toNumber(b.price);
  }
  const text = (key, max, label) => {
    if (!has(b[key])) return null;
    if (!isText(b[key]) || b[key].length > max) return invalid(`${label} must be text of ${max} characters or fewer.`);
    out[key] = b[key];
    return null;
  };
  const textProblem = text('description', 1000, 'The description') || text('category', 60, 'The category') || text('icon', 40, 'The icon');
  if (textProblem) return { problem: textProblem };
  if (has(b.durationMinutes)) {
    const minutes = toNumber(b.durationMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return { problem: invalid('The duration must be a whole number of minutes from 0 to 1440.') };
    out.durationMinutes = minutes;
  }
  if (has(b.serviceType)) {
    if (!isText(b.serviceType) || !SERVICE_TYPE_VALUES.includes(b.serviceType)) return { problem: invalid(`The service type must be one of: ${SERVICE_TYPE_VALUES.join(', ')}.`) };
    out.serviceType = b.serviceType;
  }
  const flag = ['isActive', 'isArchived', 'hiddenFromDirectSelection'].find((key) => has(b[key]) && typeof b[key] !== 'boolean');
  if (flag) return { problem: invalid(`${flag} must be true or false.`) };
  ['isActive', 'isArchived', 'hiddenFromDirectSelection'].forEach((key) => { if (has(b[key])) out[key] = b[key]; });
  if (has(b.unitTypePricing)) {
    if (!Array.isArray(b.unitTypePricing) || b.unitTypePricing.length > 20) return { problem: invalid('The unit prices must be a list of at most 20 entries.') };
    const seen = new Set();
    const cleaned = [];
    for (const entry of b.unitTypePricing) {
      if (!entry || !isText(entry.unitType) || !entry.unitType.trim()) return { problem: invalid('Each unit price needs a unit type.') };
      const problem = priceProblem(entry.price, `The price for ${entry.unitType}`);
      if (problem) return { problem };
      if (seen.has(entry.unitType)) return { problem: invalid(`${entry.unitType} is listed twice.`) };
      seen.add(entry.unitType);
      cleaned.push({ unitType: entry.unitType.trim(), price: toNumber(entry.price) });
    }
    out.unitTypePricing = cleaned;
  }
  // A hidden service is a cleaning tier (deep or pull-down), picked by the booking questions and never directly.
  const finalType = out.serviceType || (current && current.serviceType);
  const hidden = has(b.hiddenFromDirectSelection) ? b.hiddenFromDirectSelection : (current && current.hiddenFromDirectSelection);
  if (hidden === true && finalType !== SERVICE_TYPE.CLEANING) {
    return { problem: invalid('Only a Cleaning service can be hidden from direct selection (it is a cleaning tier chosen by the booking questions).') };
  }
  return { problem: null, values: out };
}

// ---- announcements
const ANNOUNCEMENT_CATEGORIES = ['Holiday', 'Closure', 'Maintenance', 'General'];

function announcementInputProblem(body, { creating }) {
  const b = body || {};
  if (creating || has(b.title)) {
    if (!isText(b.title) || !b.title.trim()) return invalid(creating ? 'Title is required.' : 'Title cannot be empty.');
    if (b.title.trim().length > 100) return invalid('The title must be 100 characters or fewer.');
  }
  if (creating || has(b.message)) {
    if (!isText(b.message) || !b.message.trim()) return invalid(creating ? 'Message is required.' : 'Message cannot be empty.');
    if (b.message.trim().length > 1000) return invalid('The message must be 1000 characters or fewer.');
  }
  if (has(b.category) && !ANNOUNCEMENT_CATEGORIES.includes(b.category)) return invalid(`The category must be one of: ${ANNOUNCEMENT_CATEGORIES.join(', ')}.`);
  if (has(b.displayDate) && (!isText(b.displayDate) || b.displayDate.length > 40)) return invalid('The date text must be 40 characters or fewer.');
  if (has(b.isActive) && typeof b.isActive !== 'boolean') return invalid('Active must be true or false.');
  return null;
}

module.exports = { userInputProblem, serviceInputProblem, announcementInputProblem, ANNOUNCEMENT_CATEGORIES, PRICE_MAX };
