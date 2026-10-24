// Which web pages may call the API from a browser (CORS). Only the origins listed in CORS_ORIGINS, plus
// localhost origins while NODE_ENV is not "production". In production the server does not start without
// CORS_ORIGINS (config/envCheck.js); if this runs anyway with none, nothing cross-origin is allowed (fail
// closed) and one warning says why. No origin is ever reflected back unless it is listed. The API uses a token in a header, not
// cookies, so no credentials are involved.
//
// CORS_ORIGINS is a comma separated list of exact origins (https://your-site.example). There are no wildcards: an entry with a *
// matches nothing, and production does not start with one (config/envCheck.js). A preview deployment on another address is allowed by
// adding its exact origin to the list.
const cors = require('cors');

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALLOWED_HEADERS = ['Authorization', 'Content-Type'];

// http://localhost or http://127.0.0.1, any port: development only.
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i;

// Whether a browser page at `origin` may call the API. A request with no Origin header (the same site,
// a server, curl) is not a cross-origin browser request and is not blocked here.
function isOriginAllowed(origin, { origins = [], production = false } = {}) {
  if (!origin) return true;
  if (!production && LOCALHOST.test(origin)) return true;
  // exact, case-insensitive match of the whole origin; an entry holding a * is never a match
  return origins.some((entry) => !entry.includes('*') && entry.toLowerCase() === origin.toLowerCase());
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
    // only what the web app sends: a token and a JSON body, with the verbs the routes use
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    maxAge: 600, // a browser may remember a preflight answer for ten minutes
    optionsSuccessStatus: 204,
    // a page may read the paging figures of a list and the id of a request to quote
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit', 'X-Request-Id'],
  });
}

module.exports = { buildCors, isOriginAllowed, parseOrigins, ALLOWED_METHODS, ALLOWED_HEADERS };
