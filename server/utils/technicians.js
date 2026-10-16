// Who counts as a field technician: the one rule used everywhere a technician is listed, picked for a job, counted as
// available, or measured. The code stores every non-customer, non-admin account with the role "staff", which also holds
// office staff such as a secretary or a cashier. A staff account is a field technician when it is active AND its
// position is one of the field positions below. A staff account with no position at all (an account made before the
// position field existed) is treated as a technician, so existing technicians keep working until an admin sets a
// position; any other position (Secretary, Cashier, anything else) never qualifies.
const { ROLE } = require('../constants/roles');

const FIELD_POSITIONS = Object.freeze(['Technician', 'Lead Technician', 'Helper']);
const FIELD_POSITION_KEYS = new Set(FIELD_POSITIONS.map((p) => p.toLowerCase()));

const positionKey = (position) => String(position || '').trim().toLowerCase();

// true for no position at all, or one of the field positions (not case sensitive).
const hasFieldPosition = (position) => {
  const key = positionKey(position);
  return key === '' || FIELD_POSITION_KEYS.has(key);
};

function isFieldTechnician(user) {
  return !!user && user.role === ROLE.STAFF && user.isActive !== false && hasFieldPosition(user.position);
}

// Every active field technician. `User` is the Mongoose model; `select` is the fields wanted besides position. The
// query itself keeps only active staff accounts; this then applies the position rule.
async function listFieldTechnicians(User, select = 'name') {
  const users = await User.find({ role: ROLE.STAFF, isActive: true }).select(`${select} position`);
  return users.filter((u) => hasFieldPosition(u.position));
}

module.exports = { FIELD_POSITIONS, hasFieldPosition, isFieldTechnician, listFieldTechnicians };
