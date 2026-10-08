const crypto = require('crypto');
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

// Letters and digits that cannot be mistaken for each other when read aloud or copied by hand:
// no 0/O, 1/l/I, 5/S, 2/Z, 8/B.
const PASSWORD_LETTERS = 'ACDEFGHJKLMNPQRTUVWXYabcdefghjkmnpqrtuvwxy';
const PASSWORD_DIGITS = '34679';

// A random password for an account an admin creates without typing one (for example a walk-in
// customer). Always has at least one letter and one digit. Shown to the admin once, never stored
// in the clear.
function generateTemporaryPassword(length = 10) {
  const pool = PASSWORD_LETTERS + PASSWORD_DIGITS;
  const pick = (chars) => chars[crypto.randomInt(chars.length)];
  const chars = [pick(PASSWORD_LETTERS), pick(PASSWORD_DIGITS)];
  while (chars.length < length) chars.push(pick(pool));
  for (let i = chars.length - 1; i > 0; i -= 1) { // shuffle so the guaranteed ones are not always first
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { hashPassword, verifyPassword, isBcryptHash, generateTemporaryPassword, SALT_ROUNDS };
