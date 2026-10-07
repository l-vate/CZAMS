const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

function isBcryptHash(value) {
  return typeof value === 'string' && value.startsWith('$2');
}

function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// The single place that still understands a legacy plain-text stored password
// (accounts created before passwords were hashed on admin-created users). A stored
// value that is not a bcrypt hash is compared directly once; on success it is
// re-hashed and saved immediately, so that account never takes this branch again.
async function verifyPassword(user, candidate) {
  if (typeof candidate !== 'string' || !user?.password) return false;

  if (isBcryptHash(user.password)) {
    return bcrypt.compare(candidate, user.password);
  }

  if (candidate !== user.password) return false;
  user.password = await hashPassword(candidate);
  await user.save();
  return true;
}

module.exports = { hashPassword, verifyPassword, isBcryptHash, SALT_ROUNDS };
