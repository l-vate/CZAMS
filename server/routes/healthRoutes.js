// GET /api/health: for an uptime monitor to ask "is the server up". No login, and only { status, time, imageProcessing }: nothing about the
// database, the environment, the version or the host. imageProcessing is "on", or "off" when the image library could not be loaded on this
// host (photos are then stored as they came, see utils/imageProcessing.js). It does not touch the database, so a monitor can wake a sleeping host without any cost.
// Limited to 60 requests a minute per address, so it cannot be used to hammer the server.
const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');
const { imageProcessingStatus } = require('../utils/imageProcessing');

const router = express.Router();

const healthLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60, countOn: () => true, label: 'health checks' });

router.get('/', healthLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', time: new Date().toISOString(), imageProcessing: imageProcessingStatus() });
});

module.exports = router;
module.exports.healthLimiter = healthLimiter;
