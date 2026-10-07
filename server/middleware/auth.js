const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the token, then checks the account still exists and is active, so a
// token issued before an admin deactivated (or deleted) the user stops working
// right away instead of staying valid until it expires.
async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const user = await User.findById(decoded.id).select('isActive');
    if (!user) {
      return res.status(401).json({ message: 'Account no longer exists' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ message: 'This account has been deactivated. Please contact the administrator.' });
    }
  } catch (err) {
    console.error('Auth account check failed:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }

  req.userId = decoded.id;
  req.userRole = decoded.role;
  next();
}

module.exports = auth;
