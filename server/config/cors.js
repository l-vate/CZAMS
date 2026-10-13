// Which web pages may call the API from a browser (CORS). Only the origins listed in CORS_ORIGINS, plus
// localhost origins while NODE_ENV is not "production". In production with CORS_ORIGINS missing nothing
// cross-origin is allowed (fail closed), and one warning says why. The API uses a token in a header, not
// cookies, so no credentials are involved.
//
// CORS_ORIGINS is a comma separated list. Each entry is an exact origin, or an origin whose host has *
// in it. A * stands for one or more letters, digits or hyphens and never matches a dot or a slash, so
// "https://myapp-*-myteam.vercel.app" matches https://myapp-git-fix-x-myteam.vercel.app and
// https://myapp-abc123-myteam.vercel.app, but not https://myapp-x-myteam.vercel.app.evil.com.
const cors = require('cors');

const escapeRegex = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

// "https://a-*-b.vercel.app" to a regular expression for the whole origin, case-insensitive.
function patternToRegex(pattern) {
  const source = pattern.split('*').map(escapeRegex).join('[a-z0-9-]+');
  return new RegExp(`^${source}$`, 'i');
}

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

// http://localhost or http://127.0.0.1, any port: development only.
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i;

// Whether a browser page at `origin` may call the API. A request with no Origin header (the same site,
// a server, curl) is not a cross-origin browser request and is not blocked here.
function isOriginAllowed(origin, { origins = [], production = false } = {}) {
  if (!origin) return true;
  if (!production && LOCALHOST.test(origin)) return true;
  return origins.some((entry) => (entry.includes('*') ? patternToRegex(entry).test(origin) : entry.toLowerCase() === origin.toLowerCase()));
}

// The CORS middleware for the app. `warn` is called once at start-up when production has no origins.
function buildCors({ env = process.env, warn = console.warn } = {}) {
  const production = env.NODE_ENV === 'production';
  const origins = parseOrigins(env.CORS_ORIGINS);

  if (production && origins.length === 0) {
    warn('CORS_ORIGINS is not set in production, so no browser page on another origin can call this API. Set CORS_ORIGINS to the frontend origin(s).');
  }

  return cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin, { origins, production })),
    // a page may read the paging figures of a list and the id of a request to quote
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit', 'X-Request-Id'],
  });
}

module.exports = { buildCors, isOriginAllowed, parseOrigins, patternToRegex };
