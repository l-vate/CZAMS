// Optional profile fields that only apply to some accounts: a staff member's position and a
// Commercial customer's company details. Everything else ignores them.
const { ROLE } = require('../constants/roles');
const { invalid } = require('./validation');

const POSITION_MAX = 40;
const COMPANY_NAME_MAX = 80;
const REPRESENTATIVE_NAME_MAX = 80;

// What the form's position list suggests. Any other text up to the limit is allowed too.
const POSITION_SUGGESTIONS = Object.freeze(['Technician', 'Lead Technician', 'Helper', 'Secretary', 'Cashier']);

const isText = (value) => typeof value === 'string';

// Reads the fields that apply to this account type from a request body. Returns
// { problem, values }: problem is null or { status, message }; values holds only the fields
// that were sent AND apply, trimmed. Fields for the wrong kind of account are dropped quietly.
// An empty string clears the field.
function readProfileFields({ role, clientType, body }) {
  const values = {};

  if (role === ROLE.STAFF && isText(body.position)) {
    const position = body.position.trim();
    if (position.length > POSITION_MAX) return { problem: invalid(`The position must be ${POSITION_MAX} characters or fewer.`) };
    values.position = position;
  }

  if (role === ROLE.CUSTOMER && clientType === 'Commercial') {
    if (isText(body.companyName)) {
      const companyName = body.companyName.trim();
      if (companyName.length > COMPANY_NAME_MAX) return { problem: invalid(`The company name must be ${COMPANY_NAME_MAX} characters or fewer.`) };
      values.companyName = companyName;
    }
    if (isText(body.representativeName)) {
      const representativeName = body.representativeName.trim();
      if (representativeName.length > REPRESENTATIVE_NAME_MAX) return { problem: invalid(`The representative name must be ${REPRESENTATIVE_NAME_MAX} characters or fewer.`) };
      values.representativeName = representativeName;
    }
  }

  return { problem: null, values };
}

// Payment terms an admin agrees with a Commercial client: a whole number of days from 7 to 10, or empty for none.
// Returns { problem, value }: `value` is undefined when nothing was sent, null to clear, or the number of days. Sent for
// anything but a Commercial customer it is refused, and a customer who is not Commercial has no terms at all.
function readAgreedTerms({ role, clientType, body }) {
  const isCommercialCustomer = role === ROLE.CUSTOMER && clientType === 'Commercial';
  if (role === ROLE.CUSTOMER && !isCommercialCustomer) return { problem: null, value: null };
  const raw = body.agreedPaymentTermsDays;
  if (raw === undefined) return { problem: null, value: undefined };
  if (raw === null || raw === '') return { problem: null, value: null };
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 7 || days > 10) {
    return { problem: invalid('Payment terms must be a whole number of days from 7 to 10, or empty for none.') };
  }
  if (!isCommercialCustomer) return { problem: invalid('Payment terms can only be agreed with a Commercial customer.') };
  return { problem: null, value: days };
}

module.exports = { readAgreedTerms, POSITION_MAX, COMPANY_NAME_MAX, REPRESENTATIVE_NAME_MAX, POSITION_SUGGESTIONS, readProfileFields };
