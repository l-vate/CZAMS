// What is served under /uploads: profile photos only, which are meant to be visible to anyone (they are shown on the landing page and
// in the app). They come from the file store like every other upload, through this route, at the same address as before. There is no
// static folder serving any more. Proof files are opened through /api/files/proofs after an access check (routes/fileRoutes.js), and
// a request for /uploads/proofs/<name> is a 404, as is anything else under /uploads.
const express = require('express');
const { getStore, KINDS } = require('../storage/fileStore');
const { safeProofName } = require('../utils/fileAccess');
const { sendStored } = require('../utils/sendStored');

const PROFILE_CACHE = 'public, max-age=86400'; // one day

function mountUploads(app, { store } = {}) {
  const files = () => store || getStore();
  const notFound = (res) => res.status(404).json({ message: 'File not found' });

  const router = express.Router();
  router.get('/profile-images/:name', async (req, res) => {
    try {
      const name = safeProofName(req.params.name);
      if (!name) return notFound(res);
      const file = await files().open(name);
      // Only a file stored as a profile image is public. A proof stored under the same store never is, whatever name is asked for.
      if (!file || file.metadata.kind !== KINDS.PROFILE_IMAGE) {
        if (file) file.stream.destroy();
        return notFound(res);
      }
      return sendStored(res, name, file, { cacheControl: PROFILE_CACHE });
    } catch (err) {
      console.error('Could not open a profile image:', err.message);
      return res.status(500).json({ message: 'Server error' });
    }
  });
  router.use((req, res) => notFound(res));
  app.use('/uploads', router);
}

module.exports = { mountUploads, PROFILE_CACHE };
