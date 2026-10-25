// Forgot password: the token, its storage, and the email. The token is 32 random bytes; only its SHA-256 hash is stored, with the
// user id and a 30 minute expiry. A request for a new link retires the older ones, and a link works once. Nothing here logs a token.
const crypto = require('crypto');
const PasswordResetToken = require('../models/PasswordResetToken');
const { smtpConfig, sendEmailNow } = require('./emailDelivery');
const { describeError } = require('./safeLog');

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const RESET_PATH = '/reset-password';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// A new token for this user. Earlier unused tokens for the same user stop working. Returns the plain token, which exists only
// here and in the email that is about to be sent.
async function issueResetToken(userId, now = new Date()) {
  const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  await PasswordResetToken.updateMany({ user: String(userId), usedAt: null }, { $set: { usedAt: now } });
  await PasswordResetToken.create({ user: String(userId), tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TOKEN_LIFETIME_MS) });
  return token;
}

// The same random generation and hashing as a real request, with nothing stored: what an unknown email does instead.
function issueUnusedToken() {
  hashToken(crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex'));
}

// The answer to a reset request is held to at least `minMs`, so a known email (database writes) and an unknown one take about the same time.
// The test runner sets it to 0; a test of the floor itself changes it.
const RESET_TIMING = { minMs: process.env.NODE_TEST_CONTEXT ? 0 : 400 };
const waitForFloor = (started) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, RESET_TIMING.minMs - (Date.now() - started))); });

const RESET_LINK_INVALID = 'This reset link is invalid or has expired. Please ask for a new one.';

// The user id this token belongs to, and the token is spent in the same step (so two requests with one link cannot both win). Null for a
// token that is malformed, unknown, expired or already used, whatever the reason.
async function consumeResetToken(token, now = new Date()) {
  if (typeof token !== 'string' || !RESET_TOKEN_PATTERN.test(token)) return null;
  const row = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );
  return row ? row.user : null;
}

// After a successful reset every other link for that user is dead as well.
function retireResetTokens(userId, now = new Date()) {
  return PasswordResetToken.updateMany({ user: String(userId), usedAt: null }, { $set: { usedAt: now } });
}

// The reset page's address with the token in the fragment (the part after #), which a browser never sends to any server, so it cannot reach a
// server log or a Referer header. Null when there is no usable website address.
function resetLink(appUrl, token) {
  try {
    const base = new URL(String(appUrl || '').trim());
    if (!['http:', 'https:'].includes(base.protocol)) return null;
    return `${base.origin}${RESET_PATH}#token=${token}`;
  } catch {
    return null;
  }
}

const MINUTES = RESET_TOKEN_LIFETIME_MS / 60000;

function renderResetEmail({ link }) {
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const text = [
    'CZAMS | Reset your password',
    '',
    'We got a request to reset the password of your CZAMS account. Open this link to choose a new one:',
    link,
    '',
    `The link expires in ${MINUTES} minutes and works once. If you did not ask for this, you can ignore this email: your password stays the same.`,
  ].join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your password</title></head>
<body style="margin:0;padding:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#0b2545;padding:22px 32px;"><div style="font-size:22px;font-weight:800;color:#ffffff;">CZAMS</div></td></tr>
      <tr><td style="padding:30px 32px 10px;">
        <h1 style="margin:0 0 14px;font-size:22px;color:#143a63;">Reset your password</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#1e293b;">We got a request to reset the password of your CZAMS account. Use the button below to choose a new one.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px;"><tr><td style="background:#143a63;border-radius:8px;">
          <a href="${esc(link)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Choose a new password</a>
        </td></tr></table>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#475569;">The link expires in ${MINUTES} minutes and works once. If you did not ask for this, ignore this email: your password stays the same.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject: 'CZAMS: Reset your password', text, html };
}

// A test (or a tool) can replace the sender: it is called with { to, link } and nothing is sent or logged.
let mailer = null;
const setResetMailer = (fn) => { mailer = fn; };

const DEV_APP_URL = 'http://localhost:5173';

// Sends the link. Production sends a real email, and only when SMTP and APP_URL are set; otherwise it says so and sends nothing. Outside
// production no email is ever sent: the link is printed to the console instead, with no recipient, so a developer can open it. The link
// is never printed in production. A failure is logged without the link.
async function deliverResetLink({ to, token, env = process.env }) {
  const production = env.NODE_ENV === 'production';
  const link = resetLink(env.APP_URL || (production ? '' : DEV_APP_URL), token);
  try {
    if (mailer) return await mailer({ to, link });
    if (production) {
      if (!link || !smtpConfig(env)) {
        console.warn('Password reset email not sent: set APP_URL and the SMTP settings.');
        return null;
      }
      return await sendEmailNow({ to, ...renderResetEmail({ link }) }, env);
    }
    if (link && !env.NODE_TEST_CONTEXT) console.warn(`[dev] Password reset link (no email sent): ${link}`);
    return null;
  } catch (err) {
    console.error('Password reset email failed:', describeError(err, env));
    return null;
  }
}

module.exports = {
  RESET_LINK_INVALID, RESET_TIMING, waitForFloor, issueUnusedToken, setResetMailer, deliverResetLink,
  RESET_TOKEN_BYTES, RESET_TOKEN_LIFETIME_MS, RESET_PATH, hashToken, issueResetToken, consumeResetToken, retireResetTokens, resetLink, renderResetEmail,
};
