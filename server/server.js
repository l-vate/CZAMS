const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config({ quiet: true });
// In production the server stops here, with a message, if JWT_SECRET or MONGO_URI is missing or the secret is too short.
require('./config/envCheck').enforceEnvironment();
const express = require('express');
// Say once, at startup, if the image library could not be loaded (photos are then stored as they came). The server keeps running.
require('./utils/imageProcessing').warnIfImageProcessingOff();
const connectDB = require('./config/db');

const databaseReady = connectDB();
const app = express();
// Behind a proxy or a host's load balancer the visitor's IP comes from a header. TRUST_PROXY is how many
// proxies to trust (for example 1); it is needed for the login rate limit to see real IPs.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY === 'true');
}
// Only the origins in CORS_ORIGINS (and localhost while not in production) may call the API from a browser.
const { requestId, apiNotFound, errorHandler } = require('./middleware/errorHandler');
app.use(requestId);
// Security headers on every answer, health check included (helmet). No X-Powered-By.
app.use(require('./config/securityHeaders').securityHeaders());
// For an uptime monitor: no login, nothing about the database or the environment. Registered before the CORS and body parsing work.
app.use('/api/health', require('./routes/healthRoutes'));
app.use(require('./config/cors').buildCors());
app.use(express.json());
// Profile photos stay public. Proof files are opened through /api/files after an access check.
require('./config/uploadsStatic').mountUploads(app);
app.use('/api/files', require('./routes/fileRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/bookings', require('./routes/emailStatusRoutes'));
app.use('/api/bookings', require('./routes/scopeLineRoutes'));
app.use('/api/bookings', require('./routes/unitRequestRoutes'));
app.use('/api/bookings', require('./routes/quotationRoutes'));
app.use('/api/supplied-units', require('./routes/suppliedUnitRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/backjobs', require('./routes/backJobRoutes'));
app.use('/api/service-reminders', require('./routes/serviceReminderRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/announcements', require('./routes/announcementRoutes'));
app.use('/api/payment-settings', require('./routes/paymentSettingsRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/teams', require('./routes/teamRoutes'));
app.use('/api/promos', require('./routes/promoRoutes'));
app.use('/api/availability', require('./routes/availabilityRoutes'));
app.use('/api/closures', require('./routes/closureRoutes'));
app.use('/api/technician-off', require('./routes/technicianOffRoutes'));
app.use('/api/audit-log', require('./routes/auditRoutes'));

// Anything not answered above: unknown /api addresses and unexpected errors answer in JSON, with no stack trace.
app.use(apiNotFound);
app.use(errorHandler);

// The scheduled jobs start once the database is connected, and each one also runs once right away: on a host that sleeps and wakes the
// process, a job whose time passed while it was asleep is caught up at the next start (see jobs/).
const { startServiceReminderSchedule } = require('./jobs/serviceReminderJob');
const { startBookingStatusSchedule } = require('./jobs/bookingStatusJob');
const { startIdPhotoRetentionSchedule } = require('./jobs/idPhotoRetentionJob');
const { startEmailDeliverySchedule } = require('./utils/emailDelivery');
databaseReady.then(() => {
  startServiceReminderSchedule();
  startBookingStatusSchedule();
  startIdPhotoRetentionSchedule();
  startEmailDeliverySchedule();
  // say once, plainly, if a unique index could not be built (utils/indexWatch.js); the server keeps running
  const mongoose = require('mongoose');
  require('./utils/indexWatch').watchIndexes(mongoose.modelNames().map((name) => mongoose.model(name)));
});

const PORT = process.env.PORT || 5000;
// eslint-disable-next-line no-console -- startup message, not debugging
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));