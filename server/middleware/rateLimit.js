// A small in-memory limit on login and registration attempts: about 10 per 15 minutes, counted per IP
// address and, separately, per email. When either count reaches the limit, further attempts get a 429
// with a clear message until that 15-minute window ends (the lockout is the rest of the window).
//
// It is kept in this server process's memory. With more than one server process, or after a restart,
// each process counts for itself. Behind a proxy or a host's load balancer, set TRUST_PROXY (see
// server.js) so the IP is the visitor's, not the proxy's.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const PRUNE_ABOVE = 5000; // entries; expired ones are dropped when the table gets this big

// `countOn(status)` decides which finished responses count as an attempt. `resetOn(status)` decides which
// ones clear the email's count (a successful login).
function createRateLimiter({ windowMs = WINDOW_MS, max = MAX_ATTEMPTS, now = () => Date.now(), countOn, resetOn = () => false, label = 'attempts' } = {}) {
  const table = new Map(); // key -> { count, resetAt }

  const live = (key) => {
    const entry = table.get(key);
    if (entry && entry.resetAt <= now()) {
      table.delete(key);
      return null;
    }
    return entry || null;
  };

  const prune = () => {
    if (table.size < PRUNE_ABOVE) return;
    const t = now();
    for (const [key, entry] of table) if (entry.resetAt <= t) table.delete(key);
  };

  const bump = (key) => {
    const entry = live(key);
    if (entry) entry.count += 1;
    else table.set(key, { count: 1, resetAt: now() + windowMs });
  };

  const secondsLeft = (key) => {
    const entry = live(key);
    return entry && entry.count >= max ? Math.max(1, Math.ceil((entry.resetAt - now()) / 1000)) : 0;
  };

  const keysFor = (req) => {
    const keys = [`ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`];
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email) keys.push(`email:${email}`);
    return keys;
  };

  const middleware = (req, res, next) => {
    prune();
    const keys = keysFor(req);
    const wait = Math.max(...keys.map(secondsLeft));
    if (wait > 0) {
      const minutes = Math.ceil(wait / 60);
      res.set('Retry-After', String(wait));
      return res.status(429).json({
        message: `Too many ${label}. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
      });
    }
    res.on('finish', () => {
      if (countOn(res.statusCode)) keys.forEach(bump);
      if (resetOn(res.statusCode)) keys.filter((k) => k.startsWith('email:')).forEach((k) => table.delete(k));
    });
    return next();
  };

  middleware.reset = () => table.clear();
  middleware.size = () => table.size;
  return middleware;
}

// Login: a wrong email or password (401) is an attempt; a good login clears that email's count.
const loginLimiter = createRateLimiter({ countOn: (s) => s === 401, resetOn: (s) => s >= 200 && s < 300, label: 'login attempts' });

// Registration: every attempt counts, successful or not.
const registerLimiter = createRateLimiter({ countOn: () => true, label: 'registration attempts' });

module.exports = { createRateLimiter, loginLimiter, registerLimiter, WINDOW_MS, MAX_ATTEMPTS };
