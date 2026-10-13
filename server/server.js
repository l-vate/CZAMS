const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config({ quiet: true });
const express = require('express');
const connectDB = require('./config/db');

connectDB();
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
app.use(require('./config/cors').buildCors());
app.use(express.json());
// Profile photos stay public. Proof files are opened through /api/files after an access check.
require('./config/uploadsStatic').mountUploads(app);
app.use('/api/files', require('./routes/fileRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
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
app.use('/api/audit-log', require('./routes/auditRoutes'));

// Anything not answered above: unknown /api addresses and unexpected errors answer in JSON, with no stack trace.
app.use(apiNotFound);
app.use(errorHandler);

const { startServiceReminderSchedule } = require('./jobs/serviceReminderJob');
startServiceReminderSchedule();

const { startBookingStatusSchedule } = require('./jobs/bookingStatusJob');
startBookingStatusSchedule();

const PORT = process.env.PORT || 5000;
// eslint-disable-next-line no-console -- startup message, not debugging
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));