// A malformed id in an address is the caller's mistake: a 400 "Invalid id", decided before anything reaches the database (where it would be
// a CastError and, in a route that does not catch it, a 500). A well-formed id that matches nothing is the route's own 404.
// Only for routers whose :id is a MongoDB ObjectId (reports, notifications, promotions, conversations); the models whose _id is a text id
// (users, services, announcements, bookings) take any text and answer 404 when there is no such record.
const OBJECT_ID = /^[a-f\d]{24}$/i;

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID.test(value);

// Registers the check on `router` for the route parameter `name`, for every route in that router that has it.
function requireObjectId(router, name = 'id') {
  router.param(name, (req, res, next, value) => {
    if (isObjectId(value)) return next();
    return res.status(400).json({ message: 'Invalid id' });
  });
}

module.exports = { requireObjectId, isObjectId };
