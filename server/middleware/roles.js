// Limits a route to certain roles. Put it right after `auth` and BEFORE any file upload step, so a refused
// request never has its files written to disk. The role is the one the auth middleware read from the
// database for this request (not the one inside the token).
const { ROLE } = require('../constants/roles');

function allowRoles(...roles) {
  return (req, res, next) => (roles.includes(req.userRole) ? next() : res.status(403).json({ message: 'Forbidden' }));
}

module.exports = { allowRoles, ROLE };
