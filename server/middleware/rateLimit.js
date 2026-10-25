// Small in-memory limits on the requests that can be abused: login, registration, password change, payment submission, file upload and
// the public availability calendar. Every limit is a named number in RATE_LIMITS below, so it can be changed in one place. A request over
// the limit gets a 429 with a clear message and a Retry-After header (seconds) until its window ends.
//
// Login and registration count per IP address (a loose limit) and, separately, per email or username (a tight one). The others count per signed in user (and per IP
// where there is no user). The answer never says whether an account exists.
//
// It is kept in this server process's memory. With more than one server process, or after a restart,
// each process counts for itself. Behind a proxy or a host's load balancer, set TRUST_PROXY (see
// server.js) so the IP is the visitor's, not the proxy's.
const MINUTE = 60 * 1000;
// The limits. Change a number here and every route that uses it follows.
const RATE_LIMITS = Object.freeze({
  // Wrong passwords: `max` per account (email or username), `maxPerIp` per IP address. The IP limit is loose on purpose: a whole classroom or
  // office shares one address, so one network must not lock itself out. The account limit is what stops guessing one person's password.
  login: Object.freeze({ windowMs: 15 * MINUTE, max: 10, maxPerIp: 60 }),
  // Registrations: `max` per email, `maxPerIp` per IP address (loose, for the same reason).
  register: Object.freeze({ windowMs: 60 * MINUTE, max: 10, maxPerIp: 60 }),
  // Asking for a password reset link: `max` per email, `maxPerIp` per IP address. Every request counts, whether or not the account exists.
  passwordResetRequest: Object.freeze({ windowMs: 60 * MINUTE, max: 5, maxPerIp: 30 }),
  // Using a reset link (an attempt with a token, good or bad), per IP address.
  passwordResetUse: Object.freeze({ windowMs: 60 * MINUTE, max: 10, maxPerIp: 10 }),
  passwordChange: Object.freeze({ windowMs: 15 * MINUTE, max: 10 }), // per user
  upload: Object.freeze({ windowMs: 10 * MINUTE, max: 30 }), // file uploads, per user
  payment: Object.freeze({ windowMs: 60 * MINUTE, max: 20 }), // payment submissions, per user
  availability: Object.freeze({ windowMs: 10 * MINUTE, max: 300 }), // the public calendar, per IP (generous: a calendar asks for a month at a time)
});
const WINDOW_MS = RATE_LIMITS.login.windowMs;
const MAX_ATTEMPTS = RATE_LIMITS.login.max;
const PRUNE_ABOVE = 5000; // entries; expired ones are dropped when the table gets this big

// `countOn(status)` decides which finished responses count as an attempt. `resetOn(status)` decides which
// ones clear the email's count (a successful login).
// `max` is the limit per account (email); `maxPerIp` the limit per IP address, which is `max` unless given.
function createRateLimiter({ windowMs = WINDOW_MS, max = MAX_ATTEMPTS, maxPerIp = max, now = () => Date.now(), countOn, resetOn = () => false, label = 'attempts' } = {}) {
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
    const limit = key.startsWith('ip:') ? maxPerIp : max;
    return entry && entry.count >= limit ? Math.max(1, Math.ceil((entry.resetAt - now()) / 1000)) : 0;
  };

  const keysFor = (req) => {
    const keys = [`ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`];
    // the account being tried: an email, or a username where a form sends one
    const account = [req.body?.email, req.body?.username].find((v) => typeof v === 'string' && v.trim());
    if (account) keys.push(`email:${account.trim().toLowerCase()}`);
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

// Whether the newer limiters count at all. The test runner turns them off (so a test that makes many payments is not blocked), RATE_LIMITS=on
// turns them back on for a test of the limit itself, and RATE_LIMITS=off is an emergency switch for a deployment.
const limitsEnabled = () => {
  const setting = String(process.env.RATE_LIMITS || '').toLowerCase();
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return !process.env.NODE_TEST_CONTEXT;
};

// A limit that counts every request when it arrives: `max` per `windowMs` for each key from `keysFor(req)` (the request is over the limit
// as soon as one of its keys is). `label` fills "Too many <label>."
function createWindowLimiter({ windowMs, max, keysFor, label, now = () => Date.now(), enabled = limitsEnabled }) {
  const table = new Map(); // key -> { count, resetAt }
  const middleware = (req, res, next) => {
    if (!enabled()) return next();
    const t = now();
    if (table.size >= PRUNE_ABOVE) for (const [key, entry] of table) if (entry.resetAt <= t) table.delete(key);
    const keys = keysFor(req);
    const entries = keys.map((key) => {
      let entry = table.get(key);
      if (!entry || entry.resetAt <= t) { entry = { count: 0, resetAt: t + windowMs }; table.set(key, entry); }
      return entry;
    });
    const over = entries.filter((e) => e.count >= max);
    if (over.length > 0) {
      const wait = Math.max(1, Math.ceil((Math.max(...over.map((e) => e.resetAt)) - t) / 1000));
      const minutes = Math.ceil(wait / 60);
      res.set('Retry-After', String(wait));
      return res.status(429).json({ message: `Too many ${label}. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.` });
    }
    entries.forEach((e) => { e.count += 1; });
    return next();
  };
  middleware.reset = () => table.clear();
  middleware.size = () => table.size;
  return middleware;
}

const ipOf = (req) => `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
// per signed in user; a request that somehow has no user is counted by its IP
const userOf = (req) => (req.userId ? `user:${req.userId}` : ipOf(req));

const passwordChangeLimiter = createWindowLimiter({ ...RATE_LIMITS.passwordChange, keysFor: (req) => [userOf(req)], label: 'password change attempts' });
const uploadLimiter = createWindowLimiter({ ...RATE_LIMITS.upload, keysFor: (req) => [userOf(req)], label: 'file uploads' });
const paymentLimiter = createWindowLimiter({ ...RATE_LIMITS.payment, keysFor: (req) => [userOf(req)], label: 'payment submissions' });
const availabilityLimiter = createWindowLimiter({ ...RATE_LIMITS.availability, keysFor: (req) => [ipOf(req)], label: 'requests for the calendar' });

// Login: a wrong email or password (401) is an attempt; a good login clears that email's count.
const loginLimiter = createRateLimiter({ windowMs: RATE_LIMITS.login.windowMs, max: RATE_LIMITS.login.max, maxPerIp: RATE_LIMITS.login.maxPerIp, countOn: (s) => s === 401, resetOn: (s) => s >= 200 && s < 300, label: 'login attempts' });

// Registration: every attempt counts, successful or not.
const registerLimiter = createRateLimiter({ windowMs: RATE_LIMITS.register.windowMs, max: RATE_LIMITS.register.max, maxPerIp: RATE_LIMITS.register.maxPerIp, countOn: () => true, label: 'registration attempts' });

// Forgot password: every request counts, so the count says nothing about whether the account exists.
const passwordResetRequestLimiter = createRateLimiter({ ...RATE_LIMITS.passwordResetRequest, countOn: () => true, label: 'password reset requests' });
const passwordResetUseLimiter = createRateLimiter({ ...RATE_LIMITS.passwordResetUse, countOn: () => true, label: 'password reset attempts' });

module.exports = {
  passwordResetRequestLimiter, passwordResetUseLimiter,
  createRateLimiter, createWindowLimiter, loginLimiter, registerLimiter, passwordChangeLimiter, uploadLimiter, paymentLimiter, availabilityLimiter,
  RATE_LIMITS, WINDOW_MS, MAX_ATTEMPTS, limitsEnabled,
};
