// Proof files (payment proofs, Senior/PWD ID photos, refund and purchase proofs, signed paper forms).
// They are no longer served as static files: each one is opened through here, after a server-side check
// of who is asking (utils/fileAccess.js). Anyone not allowed gets 404, never 403, so a file name cannot
// be confirmed by guessing.
const express = require('express');
const fs = require('fs');
const path = require('path');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Report = require('../models/Report');
const { getMemberIds } = require('../utils/assignments');
const { UPLOADS_ROOT } = require('../utils/uploadSafety');
const {
  LINK_TTL_SECONDS, safeProofName, storedPathFor, servingRulesFor, decideAccess, findReferences,
  createLinkParts, verifyLinkParts,
} = require('../utils/fileAccess');

const notFound = (res) => res.status(404).json({ message: 'File not found' });

function createFileRouter({ proofsDir = path.join(UPLOADS_ROOT, 'proofs') } = {}) {
  const router = express.Router();

  // The absolute path of an existing file in the proofs folder, or null.
  const locate = (name) => {
    const abs = path.join(proofsDir, name);
    if (path.dirname(abs) !== path.resolve(proofsDir)) return null;
    try {
      return fs.statSync(abs).isFile() ? abs : null;
    } catch {
      return null;
    }
  };

  const mayOpen = async (role, userId, name) => {
    if (role === 'admin') return true;
    const references = await findReferences(storedPathFor(name), { Booking, Report, getMemberIds });
    return decideAccess({ role, userId, references });
  };

  // A token in the Authorization header is checked by the normal auth middleware. With no header the
  // request may still carry a signed link, which the handler checks.
  const optionalAuth = (req, res, next) => (req.headers.authorization ? auth(req, res, next) : next());

  // Ask for a link that works for 5 minutes, for this file and this user only.
  router.post('/proofs/:name/link', auth, async (req, res) => {
    try {
      const name = safeProofName(req.params.name);
      if (!name || !locate(name)) return notFound(res);
      if (!(await mayOpen(req.userRole, req.userId, name))) return notFound(res);

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
      const abs = locate(name);
      if (!abs) return notFound(res);

      let allowed = false;
      if (req.userId) {
        allowed = await mayOpen(req.userRole, req.userId, name);
      } else if (req.query.sig) {
        allowed = verifyLinkParts({ name, u: req.query.u, exp: req.query.exp, sig: req.query.sig });
      }
      if (!allowed) return notFound(res);

      const { contentType, disposition } = servingRulesFor(name);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${name}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.sendFile(abs, { dotfiles: 'deny' });
    } catch (err) {
      console.error('Could not open a file:', err.message);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
}

module.exports = createFileRouter();
module.exports.createFileRouter = createFileRouter;
