// The audit trail: recordAudit() writes one AuditLog line, audited() is route middleware that records an action once the
// route has answered with success, and cleanMeta() makes sure nothing sensitive can be stored. Recording never fails the
// action that was already done: a problem is logged and the request goes on.
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

// Keys that may never be stored, whatever they hold.
const FORBIDDEN_KEY = /pass|token|secret|signature|dataurl|proof|file|account|bank|card|iban|swift|key|authorization/i;
const MAX_TEXT = 200;
const MAX_KEYS = 12;

// Only ids and small before/after values: short text, numbers, booleans, and one level of those. Anything else is dropped.
function cleanMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const out = {};
  Object.entries(meta).slice(0, MAX_KEYS).forEach(([key, value]) => {
    if (FORBIDDEN_KEY.test(key)) return;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, MAX_TEXT);
    else if (Array.isArray(value)) out[key] = value.slice(0, 10).filter((v) => ['string', 'number', 'boolean'].includes(typeof v)).map((v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : v));
    else if (typeof value === 'object') {
      const inner = cleanMeta(value);
      if (inner && Object.keys(inner).length > 0) out[key] = inner;
    }
  });
  return out;
}

// actor: { id, role, name? } (the name is looked up when it is not given). Returns the saved line, or null on a problem.
async function recordAudit({ actor, action, entityType, entityId, summary, meta }) {
  try {
    let name = actor && actor.name;
    if (!name && actor && actor.id) {
      const user = await User.findById(actor.id).select('name');
      name = (user && user.name) || '';
    }
    return await AuditLog.create({
      actor: { id: actor && actor.id, name, role: actor && actor.role },
      action,
      entityType,
      entityId: entityId === undefined || entityId === null ? undefined : String(entityId),
      summary: summary ? String(summary).slice(0, 300) : undefined,
      meta: cleanMeta(meta),
    });
  } catch (err) {
    logAuditProblem(action, err);
    return null;
  }
}

// A problem writing audit lines is logged, but only once a minute, so a database that is down does not flood the log.
let lastLoggedAt = 0;
function logAuditProblem(action, err) {
  const now = Date.now();
  if (now - lastLoggedAt < 60000) return;
  lastLoggedAt = now;
  console.error(`Could not write the audit line for ${action}:`, err.message);
}

// Route middleware, placed right after auth. `spec` is { entityType, entityId(req, body), actions(req, body) } where actions
// returns [{ action, summary, meta }] (an empty list records nothing). It records only when the route answered 2xx.
function audited(spec) {
  return (req, res, next) => {
    let sent;
    const originalJson = res.json.bind(res);
    res.json = (body) => { sent = body; return originalJson(body); };
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      let lines = [];
      try {
        lines = spec.actions(req, sent) || [];
      } catch (err) {
        console.error('Could not work out the audit lines:', err.message);
      }
      const entityId = typeof spec.entityId === 'function' ? spec.entityId(req, sent) : spec.entityId;
      lines.forEach((line) => {
        recordAudit({
          actor: { id: req.userId, role: req.userRole },
          action: line.action,
          entityType: spec.entityType,
          entityId,
          summary: line.summary,
          meta: line.meta,
        });
      });
    });
    next();
  };
}

// A single-action shorthand: audited1('refund.process', 'Booking', (req) => req.params.bookingId, 'summary').
function audited1(action, entityType, entityId, summary, meta) {
  return audited({
    entityType,
    entityId,
    actions: (req, body) => [{ action, summary: typeof summary === 'function' ? summary(req, body) : summary, meta: typeof meta === 'function' ? meta(req, body) : meta }],
  });
}

module.exports = { recordAudit, audited, audited1, cleanMeta };
