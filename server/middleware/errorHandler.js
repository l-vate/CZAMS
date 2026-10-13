// The last stop for anything a route did not answer itself. It always answers in JSON and never lets a stack trace, a file
// path or a database message leave the server, in production or not. A real fault is logged with a short request id and the
// person gets that id to quote, so it can be found in the log.
const crypto = require('crypto');

// Gives every request an id before the routes run.
function requestId(req, res, next) {
  req.id = crypto.randomBytes(4).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}

// Unknown /api address: JSON, not an HTML page.
function apiNotFound(req, res, next) {
  if (!req.path.startsWith('/api')) return next();
  return res.status(404).json({ message: 'Not found' });
}

// Express only treats a function with four arguments as an error handler, so `next` stays in the list.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  // a body that is not JSON, or too big, is the sender's mistake
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request body is not valid JSON.' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: 'The request is too large.' });
  if (err && err.status >= 400 && err.status < 500 && err.expose) return res.status(err.status).json({ message: err.message });

  console.error(`[request ${req.id || 'unknown'}] ${req.method} ${req.path}:`, err && err.message ? err.message : err);
  return res.status(500).json({ message: 'Server error', requestId: req.id });
}

module.exports = { requestId, apiNotFound, errorHandler };
