// The one place login tokens are made and read. The algorithm is pinned: tokens are signed with HS256, and a token is accepted only if it
// says HS256. A token signed with any other algorithm (HS384, HS512, RS256), or with "alg": "none", is refused however its signature
// looks, so a token cannot choose how it is checked.
const jwt = require('jsonwebtoken');

const TOKEN_ALGORITHM = 'HS256';
const TOKEN_LIFETIME = '1d';

// A token for this account. `secret` is the JWT secret (the environment's, unless a test passes its own).
function signToken({ id, role }, secret = process.env.JWT_SECRET) {
  return jwt.sign({ id, role }, secret, { algorithm: TOKEN_ALGORITHM, expiresIn: TOKEN_LIFETIME });
}

// The token's contents, or an error (jsonwebtoken's) when it is not a good HS256 token made with the secret and not yet expired.
function verifyToken(token, secret = process.env.JWT_SECRET) {
  return jwt.verify(token, secret, { algorithms: [TOKEN_ALGORITHM] });
}

module.exports = { signToken, verifyToken, TOKEN_ALGORITHM, TOKEN_LIFETIME };
