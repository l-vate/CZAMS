// The security headers every response carries (helmet): no sniffing of a file's type, no framing, a strict referrer policy, HSTS, and no
// "X-Powered-By: Express". This server answers JSON and files, never pages, so the content security policy allows nothing to load.
//
// The web app is on another origin (Vercel) and shows pictures served by this API in an <img>, so the cross-origin resource policy is
// "cross-origin": every file is still protected by its access check, not by the browser.
const helmet = require('helmet');

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false, // nothing here embeds anything
  });
}

module.exports = { securityHeaders };
