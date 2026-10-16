// A new account's public id (CUS1234) is a prefix and four random digits, so two accounts can draw the same one. The unique index on
// _id refuses the second; this tries again with a new id instead of failing the registration. A duplicate email (its own unique
// index) is not retried: it is reported as such.
const { ROLE } = require('../constants/roles');

const MAX_ATTEMPTS = 8;

// The public id of a new account: CUS (customer), STF (staff) or ADM (admin) and four random digits. The ONE generator, used by registering
// and by an admin creating an account, so both give the same kind of id.
function generateUserId(role) {
  const prefix = role === ROLE.STAFF ? 'STF' : role === ROLE.ADMIN ? 'ADM' : 'CUS';
  return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

class UserIdExhaustedError extends Error {
  constructor() {
    super('Could not create your account right now. Please try again.');
    this.name = 'UserIdExhaustedError';
  }
}

const isDuplicateOn = (field, err) => !!err && err.code === 11000
  && (err.keyPattern ? field in err.keyPattern : String(err.message || '').includes(`index: ${field}`) || (field === '_id' && String(err.message || '').includes('_id_')));

// `create(id)` must save the account with that id and return it. Tried up to MAX_ATTEMPTS times with a new id after each id collision.
// Any other error, including a duplicate email, is thrown as it is.
async function createWithUniqueUserId(create, generate, maxAttempts = MAX_ATTEMPTS) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await create(generate());
    } catch (err) {
      if (!isDuplicateOn('_id', err)) throw err;
    }
  }
  throw new UserIdExhaustedError();
}

module.exports = { generateUserId, createWithUniqueUserId, UserIdExhaustedError, isDuplicateOn, MAX_ATTEMPTS };
