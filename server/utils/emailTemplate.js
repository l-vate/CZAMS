// The look of every notification email: one branded layout (navy header, a colored headline for what happened, the message, the booking
// number in a box, an optional "Open CZAMS" button, a quiet footer). Mail apps ignore style sheets and most modern CSS, so it is a
// table layout with inline styles only, and it has a plain text twin for apps that show no HTML. Pure functions: nothing here reads the
// database or the environment, so it is easy to test.
const { NOTIFICATION_TYPE: T } = require('../constants/notificationTypes');

const BRAND = 'Cooling Zone Aircon';
const NAVY = '#0b2545';
const COLORS = { teal: '#0e8c8c', coral: '#e8553a', amber: '#b7791f', blue: '#2563eb', navy: '#143a63' };

// headline and color by notification type; anything not listed gets a neutral "Update from CZAMS"
const LOOKS = {
  [T.BOOKING_CREATED]: ['Booking received', 'blue'],
  [T.BOOKING_NEW]: ['New booking', 'blue'],
  [T.BOOKING_APPROVED]: ['Booking approved', 'teal'],
  [T.BOOKING_IN_PROGRESS]: ['Service in progress', 'blue'],
  [T.BOOKING_COMPLETED]: ['Service completed', 'teal'],
  [T.BOOKING_CANCELLED]: ['Booking cancelled', 'coral'],
  [T.PAYMENT_SUBMITTED]: ['Payment proof received', 'amber'],
  [T.PAYMENT_VERIFIED]: ['Payment verified', 'teal'],
  [T.PAYMENT_REJECTED]: ['Payment needs attention', 'coral'],
  [T.CHARGE_UPDATED]: ['Charges updated', 'amber'],
  [T.REFUND_REQUESTED]: ['Refund requested', 'amber'],
  [T.REFUND_FLAGGED]: ['Refund flagged', 'coral'],
  [T.REFUND_PROCESSED]: ['Refund processed', 'teal'],
  [T.REFUND_CONFIRMED]: ['Refund confirmed', 'teal'],
  [T.RESCHEDULE_REQUESTED]: ['Reschedule requested', 'blue'],
  [T.RESCHEDULE_RECEIVED]: ['Reschedule request received', 'blue'],
  [T.RESCHEDULE_APPROVED]: ['Schedule changed', 'teal'],
  [T.RESCHEDULE_DENIED]: ['Reschedule not approved', 'coral'],
  [T.JOB_ASSIGNED]: ['New job assigned', 'blue'],
  [T.JOB_UNASSIGNED]: ['Job unassigned', 'amber'],
  [T.DISRUPTION_REPORTED]: ['Service disrupted', 'coral'],
  [T.DISRUPTION_NOTICE]: ['Service disrupted', 'coral'],
  [T.DISRUPTION_RESCHEDULED]: ['Service rescheduled', 'blue'],
  [T.EXTENSION_REQUESTED]: ['Extra day requested', 'blue'],
  [T.EXTENSION_APPROVED]: ['Extra day approved', 'teal'],
  [T.EXTENSION_DENIED]: ['Extra day not approved', 'coral'],
  [T.BACKJOB_FILED]: ['Back job filed', 'amber'],
  [T.BACKJOB_RECEIVED]: ['Back job request received', 'blue'],
  [T.BACKJOB_DECIDED]: ['Back job decision', 'teal'],
  [T.SERVICE_REMINDER]: ['Time for your next service', 'teal'],
};

const BOOKING_NUMBER = /\bCZ-\d{4}-\d+\b/;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function lookOf(type) {
  const [headline, tone] = LOOKS[type] || ['Update from CZAMS', 'navy'];
  return { headline, color: COLORS[tone] };
}

// An absolute http(s) address, or null (a button must never link to something that is not a web page).
function safeUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

// { html, text } for one notification. `appUrl` (optional) is the address of the website, for the button.
function renderNotificationEmail({ type, message, appUrl }) {
  const { headline, color } = lookOf(type);
  const bookingId = (String(message).match(BOOKING_NUMBER) || [])[0];
  const link = safeUrl(appUrl);

  const bookingBox = bookingId
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 22px;"><tr>
         <td style="background:#f1f6fb;border-left:4px solid ${color};border-radius:6px;padding:10px 16px;">
           <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;">Booking number</div>
           <div style="font-size:17px;font-weight:700;color:${NAVY};margin-top:2px;">${escapeHtml(bookingId)}</div>
         </td></tr></table>`
    : '';
  const button = link
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 8px;"><tr>
         <td style="background:${color};border-radius:8px;">
           <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Open CZAMS</a>
         </td></tr></table>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(headline)}</title></head>
<body style="margin:0;padding:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:${NAVY};padding:22px 32px;">
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:.02em;">CZAMS</div>
        <div style="font-size:12px;color:#9fb6d0;margin-top:2px;">${BRAND}</div>
      </td></tr>
      <tr><td style="height:4px;background:${color};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:30px 32px 10px;">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${color};">${escapeHtml(headline)}</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#1e293b;">${escapeHtml(message)}</p>
        ${bookingBox}
        ${button}
      </td></tr>
      <tr><td style="padding:18px 32px 28px;border-top:1px solid #e8eef4;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">This email was sent by CZAMS. Sign in to your account to view more details.<br>You are receiving it because of activity on your ${BRAND} account.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    `CZAMS | ${headline}`,
    '',
    message,
    ...(bookingId ? ['', `Booking number: ${bookingId}`] : []),
    ...(link ? ['', `Open CZAMS: ${link}`] : []),
    '',
    'This email was sent by CZAMS. Sign in to your account to view more details.',
  ].join('\n');

  return { html, text };
}

module.exports = { renderNotificationEmail, lookOf };
