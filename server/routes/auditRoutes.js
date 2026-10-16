// The audit log, for admins only: newest first, paginated, filtered by date range (Manila days, both ends included), who
// did it, what, and to which kind of record.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { ROLE } = require('../constants/roles');
const AuditLog = require('../models/AuditLog');
const { isRealDateKey } = require('../utils/closures');
const { invalid, sendProblem } = require('../utils/validation');
const { sendRouteError } = require('../utils/routeErrors');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ACTION_PATTERN = /^[a-z_.]{1,60}$/;
const ENTITY_TYPES = ['Booking', 'User', 'PaymentSettings', 'Promo', 'Service', 'Announcement', 'Closure', 'Report', 'BackJob'];

// Manila day boundaries as real instants (Manila is UTC+8 all year).
const startOfManilaDay = (key) => new Date(`${key}T00:00:00.000+08:00`);
const endOfManilaDay = (key) => new Date(`${key}T23:59:59.999+08:00`);

// Reads the query into a Mongo filter. Every value must be plain text of the expected shape, so no operator can be
// smuggled in through a query parameter. Returns { problem } or { filter }.
function readFilter(query) {
  const filter = {};
  const text = (v) => (typeof v === 'string' ? v.trim() : undefined);
  const from = text(query.from);
  const to = text(query.to);
  if (query.from !== undefined && query.from !== '' && !(from && isRealDateKey(from))) return { problem: invalid('Choose a valid start date (YYYY-MM-DD).') };
  if (query.to !== undefined && query.to !== '' && !(to && isRealDateKey(to))) return { problem: invalid('Choose a valid end date (YYYY-MM-DD).') };
  if (from && to && to < from) return { problem: invalid('The end date cannot be before the start date.') };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = startOfManilaDay(from);
    if (to) filter.createdAt.$lte = endOfManilaDay(to);
  }
  const actor = text(query.actor);
  if (query.actor !== undefined && query.actor !== '' && !(actor && actor.length <= 80)) return { problem: invalid('That admin filter is not valid.') };
  if (actor) filter['actor.id'] = actor;
  const action = text(query.action);
  if (query.action !== undefined && query.action !== '' && !(action && ACTION_PATTERN.test(action))) return { problem: invalid('That action filter is not valid.') };
  if (action) filter.action = action;
  const entityType = text(query.entityType);
  if (query.entityType !== undefined && query.entityType !== '' && !ENTITY_TYPES.includes(entityType)) return { problem: invalid(`The record type must be one of: ${ENTITY_TYPES.join(', ')}.`) };
  if (entityType) filter.entityType = entityType;
  const entityId = text(query.entityId);
  if (query.entityId !== undefined && query.entityId !== '' && !(entityId && entityId.length <= 80)) return { problem: invalid('That record filter is not valid.') };
  if (entityId) filter.entityId = entityId;
  return { filter };
}

router.get('/', auth, async (req, res) => {
  try {
    if (req.userRole !== ROLE.ADMIN) return res.status(403).json({ message: 'Forbidden' });

    const read = readFilter(req.query);
    if (read.problem) return sendProblem(res, read.problem);

    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const [items, total] = await Promise.all([
      AuditLog.find(read.filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(read.filter),
    ]);
    res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    sendRouteError(res, err);
  }
});

module.exports = router;
module.exports.readFilter = readFilter;
