const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const EmailDelivery = require('../models/EmailDelivery');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const {
  smtpConfig,
  queueNotificationEmail,
  processPendingEmailDeliveries,
} = require('../utils/emailDelivery');
const { sendNotification } = require('../utils/notifications');

const originals = {
  userFindById: User.findById,
  deliveryCreate: EmailDelivery.create,
  deliveryFindOneAndUpdate: EmailDelivery.findOneAndUpdate,
  deliveryUpdateOne: EmailDelivery.updateOne,
  notificationCreate: Notification.create,
};

const SMTP_ENV = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
  SMTP_FROM: 'CZAMS <notifications@example.test>',
};
const smtpEnvKeys = Object.keys(SMTP_ENV);
const originalSmtpEnv = Object.fromEntries(smtpEnvKeys.map((key) => [key, process.env[key]]));

test.before(() => Object.assign(process.env, SMTP_ENV));

test.after(() => {
  User.findById = originals.userFindById;
  EmailDelivery.create = originals.deliveryCreate;
  EmailDelivery.findOneAndUpdate = originals.deliveryFindOneAndUpdate;
  EmailDelivery.updateOne = originals.deliveryUpdateOne;
  Notification.create = originals.notificationCreate;
  smtpEnvKeys.forEach((key) => {
    if (originalSmtpEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalSmtpEnv[key];
  });
});

test('SMTP settings are optional and require valid host, sender, and paired credentials', () => {
  assert.equal(smtpConfig({}), null);
  assert.equal(smtpConfig({ SMTP_HOST: 'smtp.example.test' }), null);
  assert.equal(smtpConfig({ ...SMTP_ENV, SMTP_PASS: '' }), null);

  const config = smtpConfig({ ...SMTP_ENV, SMTP_SECURE: 'true' });
  assert.equal(config.host, 'smtp.example.test');
  assert.equal(config.port, 587);
  assert.equal(config.secure, true);
  assert.deepEqual(config.auth, { user: 'user', pass: 'pass' });
});

test('only selected notification types are enqueued for recipients with email', async () => {
  const queued = [];
  User.findById = () => ({ select: async () => ({ email: 'customer@example.test' }) });
  EmailDelivery.create = async (delivery) => { queued.push(delivery); return delivery; };

  await queueNotificationEmail('CUS1', NOTIFICATION_TYPE.SERVICE_REMINDER, 'Reminder', 'NOTE1', SMTP_ENV);
  await queueNotificationEmail('CUS1', NOTIFICATION_TYPE.CHAT_MESSAGE, 'Chat', 'NOTE2', SMTP_ENV);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].notification, 'NOTE1');
  assert.equal(queued[0].recipientEmail, 'customer@example.test');
  assert.match(queued[0].subject, /Service Reminder/);
});

test('sendNotification persists in-app notification and queues email without sending inline', async () => {
  let savedNotification;
  let queuedDelivery;
  User.findById = () => ({ select: async () => ({ email: 'customer@example.test' }) });
  Notification.create = async (doc) => {
    savedNotification = { ...doc, _id: 'NOTE1' };
    return savedNotification;
  };
  EmailDelivery.create = async (doc) => { queuedDelivery = doc; return doc; };

  const notification = await sendNotification(
    'CUS1',
    NOTIFICATION_TYPE.BOOKING_APPROVED,
    'Your booking is approved.',
    { booking: { _id: 'BOOK1', bookingId: 'CZ-001' } }
  );

  assert.equal(notification, savedNotification);
  assert.equal(savedNotification.relatedBookingId, 'CZ-001');
  assert.equal(queuedDelivery.notification, 'NOTE1');
  assert.equal(queuedDelivery.recipientEmail, 'customer@example.test');
});

test('an email queue failure does not prevent the in-app notification', async () => {
  const savedNotification = { _id: 'NOTE2', message: 'Booking update' };
  Notification.create = async () => savedNotification;
  User.findById = () => ({ select: async () => ({ email: 'customer@example.test' }) });
  EmailDelivery.create = async () => { throw new Error('queue unavailable'); };
  const originalError = console.error;
  console.error = () => {};

  try {
    const notification = await sendNotification(
      'CUS1',
      NOTIFICATION_TYPE.BOOKING_APPROVED,
      'Booking update'
    );
    assert.equal(notification, savedNotification);
  } finally {
    console.error = originalError;
  }
});

test('delivery worker marks successful sends as sent', async () => {
  const delivery = { _id: 'MAIL1', attempts: 0 };
  const updates = [];
  let claimed = false;
  EmailDelivery.findOneAndUpdate = async () => {
    if (claimed) return null;
    claimed = true;
    return delivery;
  };
  EmailDelivery.updateOne = async (...args) => { updates.push(args); };

  const result = await processPendingEmailDeliveries({
    send: async (item) => assert.equal(item, delivery),
  });

  assert.deepEqual(result, { processed: 1 });
  assert.equal(updates[0][1].$set.status, 'sent');
  assert.ok(updates[0][1].$set.sentAt instanceof Date);
});

test('delivery worker schedules a retry after a temporary failure', async () => {
  const delivery = { _id: 'MAIL2', attempts: 0 };
  let update;
  let claimed = false;
  EmailDelivery.findOneAndUpdate = async () => {
    if (claimed) return null;
    claimed = true;
    return delivery;
  };
  EmailDelivery.updateOne = async (_filter, value) => { update = value; };

  const now = new Date('2026-01-01T00:00:00Z');
  await processPendingEmailDeliveries({
    now,
    send: async () => { throw new Error('temporary failure'); },
  });

  assert.equal(update.$set.status, 'pending');
  assert.equal(update.$set.attempts, 1);
  assert.equal(update.$set.nextAttemptAt.getTime(), now.getTime() + 60_000);
  assert.equal(update.$set.lastError, 'temporary failure');
});

test('delivery worker stops retrying after the fifth failed attempt', async () => {
  const delivery = { _id: 'MAIL3', attempts: 4 };
  let update;
  let claimed = false;
  EmailDelivery.findOneAndUpdate = async () => {
    if (claimed) return null;
    claimed = true;
    return delivery;
  };
  EmailDelivery.updateOne = async (_filter, value) => { update = value; };

  await processPendingEmailDeliveries({ send: async () => { throw new Error('permanent failure'); } });

  assert.equal(update.$set.status, 'failed');
  assert.equal(update.$set.attempts, 5);
});
