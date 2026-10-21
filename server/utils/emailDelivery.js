const cron = require('node-cron');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const EmailDelivery = require('../models/EmailDelivery');
const User = require('../models/User');
const { TIMEZONE } = require('./timeBlocks');

const EMAIL_NOTIFICATION_TYPES = new Set([
  NOTIFICATION_TYPE.BOOKING_CREATED,
  NOTIFICATION_TYPE.BOOKING_NEW,
  NOTIFICATION_TYPE.BOOKING_APPROVED,
  NOTIFICATION_TYPE.BOOKING_CANCELLED,
  NOTIFICATION_TYPE.BOOKING_COMPLETED,
  NOTIFICATION_TYPE.PAYMENT_SUBMITTED,
  NOTIFICATION_TYPE.PAYMENT_VERIFIED,
  NOTIFICATION_TYPE.PAYMENT_REJECTED,
  NOTIFICATION_TYPE.REFUND_REQUESTED,
  NOTIFICATION_TYPE.REFUND_FLAGGED,
  NOTIFICATION_TYPE.REFUND_PROCESSED,
  NOTIFICATION_TYPE.REFUND_CONFIRMED,
  NOTIFICATION_TYPE.RESCHEDULE_REQUESTED,
  NOTIFICATION_TYPE.RESCHEDULE_RECEIVED,
  NOTIFICATION_TYPE.RESCHEDULE_APPROVED,
  NOTIFICATION_TYPE.RESCHEDULE_DENIED,
  NOTIFICATION_TYPE.JOB_ASSIGNED,
  NOTIFICATION_TYPE.JOB_UNASSIGNED,
  NOTIFICATION_TYPE.DISRUPTION_REPORTED,
  NOTIFICATION_TYPE.DISRUPTION_NOTICE,
  NOTIFICATION_TYPE.DISRUPTION_RESCHEDULED,
  NOTIFICATION_TYPE.EXTENSION_REQUESTED,
  NOTIFICATION_TYPE.EXTENSION_APPROVED,
  NOTIFICATION_TYPE.EXTENSION_DENIED,
  NOTIFICATION_TYPE.BACKJOB_FILED,
  NOTIFICATION_TYPE.BACKJOB_RECEIVED,
  NOTIFICATION_TYPE.BACKJOB_DECIDED,
  NOTIFICATION_TYPE.SERVICE_REMINDER,
]);

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 10;
const PROCESSING_LEASE_MS = 10 * 60 * 1000;
let transporter;
let transporterConfig;

function smtpConfig(env = process.env) {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const port = Number(env.SMTP_PORT || 587);

  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if ((user && !pass) || (!user && pass)) return null;

  return {
    host,
    port,
    secure: ['true', '1', 'yes'].includes(String(env.SMTP_SECURE || '').toLowerCase()),
    from,
    ...(user ? { auth: { user, pass } } : {}),
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function subjectFor(type) {
  return `CZAMS: ${type.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')}`;
}

async function queueNotificationEmail(userId, type, message, notificationId, env = process.env) {
  if (!EMAIL_NOTIFICATION_TYPES.has(type) || !smtpConfig(env)) return null;

  const recipient = await User.findById(userId).select('email');
  if (!recipient?.email) return null;

  const safeMessage = escapeHtml(message);
  return EmailDelivery.create({
    notification: notificationId,
    recipientEmail: recipient.email,
    subject: subjectFor(type),
    text: `${message}\n\nThis email was sent by CZAMS. Sign in to your account to view more details.`,
    html: `<p>${safeMessage}</p><p>This email was sent by CZAMS. Sign in to your account to view more details.</p>`,
  });
}

async function sendEmail(delivery, env = process.env) {
  const config = smtpConfig(env);
  if (!config) throw new Error('SMTP email settings are incomplete.');

  const currentConfig = JSON.stringify(config);
  if (!transporter || currentConfig !== transporterConfig) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.auth ? { auth: config.auth } : {}),
    });
    transporterConfig = currentConfig;
  }

  await transporter.sendMail({
    from: config.from,
    to: delivery.recipientEmail,
    subject: delivery.subject,
    text: delivery.text,
    html: delivery.html,
  });
}

async function processPendingEmailDeliveries({ now = new Date(), send = sendEmail } = {}) {
  let processed = 0;
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);

  while (processed < BATCH_SIZE) {
    const delivery = await EmailDelivery.findOneAndUpdate(
      {
        $or: [
          { status: 'pending', nextAttemptAt: { $lte: now } },
          { status: 'processing', processingAt: { $lt: staleBefore } },
        ],
      },
      { $set: { status: 'processing', processingAt: now } },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, new: true }
    );
    if (!delivery) break;

    try {
      await send(delivery);
      await EmailDelivery.updateOne(
        { _id: delivery._id },
        { $set: { status: 'sent', sentAt: new Date(), lastError: null }, $unset: { processingAt: 1 } }
      );
    } catch (err) {
      const attempts = delivery.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      const retryDelayMs = Math.min(60 * 60 * 1000, 60 * 1000 * (2 ** (attempts - 1)));
      await EmailDelivery.updateOne(
        { _id: delivery._id },
        {
          $set: {
            status: failed ? 'failed' : 'pending',
            attempts,
            nextAttemptAt: failed ? now : new Date(now.getTime() + retryDelayMs),
            lastError: String(err.message || err).slice(0, 500),
          },
          $unset: { processingAt: 1 },
        }
      );
      console.error(`Email delivery ${delivery._id} ${failed ? 'failed permanently' : 'will retry'}:`, err.message);
    }
    processed += 1;
  }

  return { processed };
}

async function safeProcessPendingEmailDeliveries() {
  try {
    await processPendingEmailDeliveries();
  } catch (err) {
    console.error('Email delivery worker failed:', err);
  }
}

function startEmailDeliverySchedule() {
  if (!smtpConfig()) {
    console.warn('Email delivery is disabled: configure SMTP_HOST and SMTP_FROM (and SMTP_USER/SMTP_PASS when required).');
    return;
  }
  cron.schedule('* * * * *', safeProcessPendingEmailDeliveries, { timezone: TIMEZONE });
  safeProcessPendingEmailDeliveries();
}

module.exports = {
  EMAIL_NOTIFICATION_TYPES,
  smtpConfig,
  queueNotificationEmail,
  processPendingEmailDeliveries,
  startEmailDeliverySchedule,
};
