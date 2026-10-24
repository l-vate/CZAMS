const { verifyToken } = require('../utils/jwtTokens');
const User = require('../models/User');
const { authCache } = require('../utils/authCache');

// Verifies the token, then looks the account up (role and active flag) on every request, so a token
// issued before an admin deactivated, deleted or changed the role of the user stops working, or
// stops carrying the old role, right away instead of staying valid until it expires. The lookup is
// remembered for a few seconds (utils/authCache.js) and forgotten as soon as an admin edits the
// account. The role used is the one in the database, never the one inside the token.
async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyToken(token); // HS256 only (utils/jwtTokens.js)
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  let account = authCache.get(decoded.id);
  if (!account) {
    try {
      const user = await User.findById(decoded.id).select('role isActive passwordChangedAt');
      account = user
        ? { exists: true, role: user.role, isActive: user.isActive, passwordChangedAt: user.passwordChangedAt || null }
        : { exists: false };
    } catch (err) {
      console.error('Auth account check failed:', err.message);
      return res.status(500).json({ message: 'Server error' });
    }
    authCache.set(decoded.id, account);
  }

  if (!account.exists) {
    return res.status(401).json({ message: 'Account no longer exists' });
  }
  if (account.isActive === false) {
    return res.status(403).json({ message: 'This account has been deactivated. Please contact the administrator.' });
  }

  // A password change signs out every token issued before it. Compared in whole seconds (a token's
  // issued-at has no milliseconds), so the fresh token returned by the change itself, issued in the same
  // second, stays valid.
  if (account.passwordChangedAt && decoded.iat < Math.floor(new Date(account.passwordChangedAt).getTime() / 1000)) {
    return res.status(401).json({ message: 'Your password was changed. Please log in again.' });
  }

  req.userId = decoded.id;
  req.userRole = account.role;
  next();
}

module.exports = auth;
