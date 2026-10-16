// GET /api/health: for an uptime monitor to ask "is the server up". No login, and only { status, time }: nothing about the database,
// the environment, the version or the host. It does not touch the database, so a monitor can wake a sleeping host without any cost.
// Limited to 60 requests a minute per address, so it cannot be used to hammer the server.
const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const healthLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60, countOn: () => true, label: 'health checks' });

router.get('/', healthLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', time: new Date().toISOString() });
});

module.exports = router;
module.exports.healthLimiter = healthLimiter;
