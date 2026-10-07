// User.role values, exactly as stored.
const ROLE = Object.freeze({
  ADMIN: 'admin',
  STAFF: 'staff',
  CUSTOMER: 'customer',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLE));

module.exports = { ROLE, ROLE_VALUES };
