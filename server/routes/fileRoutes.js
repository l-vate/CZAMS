// Proof files (payment proofs, Senior/PWD ID photos, refund and purchase proofs, signed paper forms).
// They are no longer served as static files: each one is opened through here, after a server-side check
// of who is asking (utils/fileAccess.js). Anyone not allowed gets 404, never 403, so a file name cannot
// be confirmed by guessing.
const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Report = require('../models/Report');
const { getMemberIds } = require('../utils/assignments');
const { getStore } = require('../storage/fileStore');
const { sendStored } = require('../utils/sendStored');
const {
  LINK_TTL_SECONDS, safeProofName, storedPathFor, decideAccess, isIdPhoto, findReferences,
  createLinkParts, verifyLinkParts,
} = require('../utils/fileAccess');

const notFound = (res) => res.status(404).json({ message: 'File not found' });
// A Senior/PWD ID photo is for the admin role only: everyone else is told so plainly (403) instead of a 404.
const forbidden = (res) => res.status(403).json({ message: 'Forbidden' });

// Files are read from the file store (storage/fileStore.js): GridFS in production, and in development the local folder as well, so
// files saved before the store existed still open. The access rules do not depend on where the bytes are.
function createFileRouter({ store } = {}) {
  const router = express.Router();
  const files = () => store || getStore();

  // 'allow', 'deny' (404) or 'forbidden' (403, an ID photo and not the admin role).
  const decide = async (role, userId, name) => {
    if (role === 'admin') return 'allow';
    const references = await findReferences(storedPathFor(name), { Booking, Report, getMemberIds });
    if (isIdPhoto(references)) return 'forbidden';
    return decideAccess({ role, userId, references }) ? 'allow' : 'deny';
  };
  const refuse = (res, verdict) => (verdict === 'forbidden' ? forbidden(res) : notFound(res));

  // A token in the Authorization header is checked by the normal auth middleware. With no header the
  // request may still carry a signed link, which the handler checks.
  const optionalAuth = (req, res, next) => (req.headers.authorization ? auth(req, res, next) : next());

  // Ask for a link that works for 5 minutes, for this file and this user only.
  router.post('/proofs/:name/link', auth, async (req, res) => {
    try {
      const name = safeProofName(req.params.name);
      if (!name || !(await files().exists(name))) return notFound(res);
      const verdict = await decide(req.userRole, req.userId, name);
      if (verdict !== 'allow') return refuse(res, verdict);

      const parts = createLinkParts({ name, userId: req.userId });
      if (!parts) return res.status(500).json({ message: 'Server error' });
      const query = new URLSearchParams({ u: parts.u, exp: String(parts.exp), sig: parts.sig });
      res.json({
        url: `/api/files/proofs/${encodeURIComponent(name)}?${query.toString()}`,
        expiresInSeconds: LINK_TTL_SECONDS,
      });
    } catch (err) {
      console.error('Could not make a file link:', err.message);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Open the file: with a valid token that is allowed to, or with a valid unexpired signed link.
  router.get('/proofs/:name', optionalAuth, async (req, res) => {
    try {
      const name = safeProofName(req.params.name);
      if (!name) return notFound(res);
      if (!(await files().exists(name))) return notFound(res);

      let verdict = 'deny';
      if (req.userId) {
        verdict = await decide(req.userRole, req.userId, name);
      } else if (req.query.sig && verifyLinkParts({ name, u: req.query.u, exp: req.query.exp, sig: req.query.sig })) {
        // A signed link is tied to the person it was made for. For an ID photo that person must still be an active admin.
        const references = await findReferences(storedPathFor(name), { Booking, Report, getMemberIds });
        if (isIdPhoto(references)) {
          const who = await User.findById(req.query.u).select('role isActive');
          verdict = who && who.role === 'admin' && who.isActive !== false ? 'allow' : 'forbidden';
        } else {
          verdict = 'allow';
        }
      }
      if (verdict !== 'allow') return refuse(res, verdict);

      const file = await files().open(name);
      if (!file) return notFound(res);
      sendStored(res, name, file, { cacheControl: 'private, no-store' });
    } catch (err) {
      console.error('Could not open a file:', err.message);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
}

module.exports = createFileRouter();
module.exports.createFileRouter = createFileRouter;
