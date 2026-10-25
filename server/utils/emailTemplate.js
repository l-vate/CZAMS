// The look of every email the system sends. One shared layout, built from a small set of blocks so every kind looks the same: a hidden preheader
// (the preview line in the inbox), the header with the company logo and full name, a colored status accent with a text label that also reads when
// colors and images are blocked, a headline and one or two sentences, a table of only the details that apply, one clear button with the full
// address under it as plain text, a "what happens next" line, and a footer with the company's real contact details.
//
// Email clients ignore style sheets and most modern CSS, so this is table layout with inline styles (a small <style> block only adds dark mode
// and the narrow-screen stacking, and an email that loses it still reads). The logo is attached to the message inline (cid:czams-logo) instead
// of being linked, so it shows without a hosted address; the header always has a navy band and the logo sits on a white plate, so it never
// disappears on a dark background. Every email also has a plain text twin. Pure functions: nothing here reads the database or the environment.
const { contentOf } = require('./emailContent');
const company = require('./companyInfo');
const { getPaymentBreakdown } = require('./pricing');
const { NOTIFICATION_TYPE: T } = require('../constants/notificationTypes');

const LOGO_CID = 'czams-logo';
const LOGO_ALT = company.name;
const LOGO_FILE = 'email-logo.png'; // server/assets/email-logo.png, 240 px wide, made from public/images/logo.png (scripts/buildEmailLogo.js)

const NAVY = '#0b2545';
const FONT = "'Outfit','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Colors per tone. `bar` is the accent stripe; `chipBg` and `chipText` are the status label. Every text and background pair below is checked for
// WCAG AA contrast (4.5 to 1) in the tests, in light and in dark mode.
const TONES = {
  green: { bar: '#15803d', chipBg: '#dcfce7', chipText: '#14532d' },
  coral: { bar: '#e8553a', chipBg: '#fee2e2', chipText: '#991b1b' },
  amber: { bar: '#d97706', chipBg: '#fef3c7', chipText: '#78350f' },
  blue: { bar: '#2563eb', chipBg: '#dbeafe', chipText: '#1e3a8a' },
};
const LIGHT = { page: '#eef3f8', card: '#ffffff', head: NAVY, body: '#1e293b', muted: '#475569', rule: '#e2e8f0', box: '#f1f5f9', button: NAVY, buttonText: '#ffffff', link: '#1d4ed8', footerBg: '#f1f5f9', footerText: '#475569' };
const DARK = { page: '#0b1220', card: '#111c30', head: '#ffffff', body: '#e2e8f0', muted: '#cbd5e1', rule: '#233554', box: '#16243d', button: '#1d4ed8', buttonText: '#ffffff', link: '#93c5fd', footerBg: '#0e1829', footerText: '#cbd5e1' };

// The text-on-background pairs used, for the contrast test.
const COLOR_PAIRS = [
  ['header name', '#ffffff', NAVY], ['header tagline', '#cbd5e1', NAVY],
  ['headline', LIGHT.head, LIGHT.card], ['body', LIGHT.body, LIGHT.card], ['muted', LIGHT.muted, LIGHT.card], ['detail label', LIGHT.muted, LIGHT.box],
  ['detail value', LIGHT.body, LIGHT.box], ['button', LIGHT.buttonText, LIGHT.button], ['link', LIGHT.link, LIGHT.card], ['footer', LIGHT.footerText, LIGHT.footerBg],
  ['dark headline', DARK.head, DARK.card], ['dark body', DARK.body, DARK.card], ['dark muted', DARK.muted, DARK.card], ['dark detail label', DARK.muted, DARK.box],
  ['dark detail value', DARK.body, DARK.box], ['dark button', DARK.buttonText, DARK.button], ['dark link', DARK.link, DARK.card], ['dark footer', DARK.footerText, DARK.footerBg],
  ...Object.entries(TONES).map(([tone, c]) => [`${tone} status label`, c.chipText, c.chipBg]),
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// An absolute http(s) address, or null (a button must never link to something that is not a web page).
function safeUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

// Where "View booking" goes: the booking's own page for this kind of recipient. No token, no secret, only the booking number in the path.
const BOOKING_PATH = { customer: (id) => `/customer/book_details/${id}`, admin: (id) => `/admin/services/requests/${id}`, staff: () => '/staff/my_jobs' };
function bookingUrl(appUrl, bookingId, role) {
  const base = safeUrl(appUrl);
  if (!base) return null;
  if (!bookingId) return base.href;
  const path = (BOOKING_PATH[role] || BOOKING_PATH.customer)(encodeURIComponent(bookingId));
  return new URL(path, base.origin).href;
}

// "2026-11-12" as "Thu, Nov 12, 2026" (a booking's date is a plain Manila calendar day, so it is read as that day whatever the server's zone).
function friendlyDate(key) {
  const d = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(key) : d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const BOOKING_NUMBER = /\bCZ-\d{4}-\d+\b/;

// The area of an address (its last two parts, for example "Quezon City, Metro Manila"), never the street and number.
function addressArea(address) {
  const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join(', ') : parts.join(', ');
}

const peso = (n) => `₱${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const MONEY_TYPES = new Set([T.PAYMENT_SUBMITTED, T.PAYMENT_VERIFIED, T.PAYMENT_REJECTED, T.CHARGE_UPDATED, T.SCOPE_UPDATED, T.QUOTATION_UPDATED, T.UNIT_REQUEST_RESOLVED, T.DISCOUNT_APPROVED, T.BOOKING_COMPLETED]);
const REFUND_TYPES = new Set([T.REFUND_REQUESTED, T.REFUND_PROCESSED, T.REFUND_CONFIRMED, T.REFUND_FLAGGED]);

function unitText(booking) {
  const units = Array.isArray(booking?.units) ? booking.units.slice(0, 3) : [];
  return units.map((u) => [`${u.quantity || 1}x ${u.type}`, u.hp ? `${u.hp} HP` : '', u.brand || u.brandModel || ''].filter(Boolean).join(', ')).join('; ');
}

function amountRow(type, booking) {
  try {
    if (REFUND_TYPES.has(type)) {
      const r = booking?.refund;
      const amount = r && (Number.isFinite(r.refundableAmount) ? r.refundableAmount : r.downPaymentAmount);
      return Number.isFinite(amount) ? ['Refund', peso(amount)] : null;
    }
    if (MONEY_TYPES.has(type) && booking?.service && typeof booking.service === 'object') {
      const { total } = getPaymentBreakdown(booking);
      return Number.isFinite(total) ? ['Total', peso(total)] : null;
    }
  } catch {
    // an amount that cannot be worked out is left out, never guessed
  }
  return null;
}

// The details table: only the fields that apply. [[label, value]]. Never an ID photo, a full payment reference, a password or a full address.
function detailRows({ type, bookingId, booking }) {
  const rows = [];
  if (bookingId) rows.push(['Booking number', bookingId]);
  const serviceName = booking?.service && typeof booking.service === 'object' ? booking.service.name : '';
  if (serviceName) rows.push(['Service', serviceName]);
  const units = unitText(booking);
  if (units) rows.push(['Unit', units]);
  if (booking?.date) rows.push(['Date and time', [friendlyDate(booking.date), booking.time].filter(Boolean).join(', ')]);
  const area = addressArea(booking?.address);
  if (area) rows.push(['Area', area]);
  const money = amountRow(type, booking);
  if (money) rows.push(money);
  if (booking?.status) rows.push(['Status', booking.status]);
  return rows;
}

// ---- the shared layout -----------------------------------------------------------------------------------------------------------------

function detailsTable(rows, tone) {
  if (rows.length === 0) return '';
  const body = rows.map(([label, value], i) => `<tr>
        <td class="stack t-muted box-text" style="width:38%;padding:9px 14px;font-size:13px;line-height:1.4;color:${LIGHT.muted};${i > 0 ? `border-top:1px solid ${LIGHT.rule};` : ''}" valign="top">${escapeHtml(label)}</td>
        <td class="stack t-body box-text" style="padding:9px 14px;font-size:15px;line-height:1.4;font-weight:600;color:${LIGHT.body};${i > 0 ? `border-top:1px solid ${LIGHT.rule};` : ''}" valign="top">${escapeHtml(value)}</td>
      </tr>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="detail-box" style="margin:0 0 20px;background:${LIGHT.box};border-left:4px solid ${TONES[tone].bar};border-radius:6px;">${body}</table>`;
}

// A button that works in Outlook too: a VML rounded rectangle for Outlook, a padded table cell for everything else.
function button(label, url) {
  const href = escapeHtml(url);
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 10px;"><tr><td class="btn-cell" align="center" bgcolor="${LIGHT.button}" style="background:${LIGHT.button};border-radius:8px;">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="18%" stroke="f" fillcolor="${LIGHT.button}"><w:anchorlock/><center style="color:${LIGHT.buttonText};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(label)}</center></v:roundrect><![endif]-->
        <!--[if !mso]><!--><a href="${href}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:${LIGHT.buttonText};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a><!--<![endif]-->
      </td></tr></table>`;
}

function darkCss() {
  return `<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .bg { background-color: ${DARK.page} !important; }
    .card { background-color: ${DARK.card} !important; }
    .t-head { color: ${DARK.head} !important; }
    .t-body { color: ${DARK.body} !important; }
    .t-muted { color: ${DARK.muted} !important; }
    .t-link { color: ${DARK.link} !important; }
    .detail-box { background-color: ${DARK.box} !important; }
    .btn-cell { background-color: ${DARK.button} !important; }
    .footer { background-color: ${DARK.footerBg} !important; border-top-color: ${DARK.rule} !important; }
    .t-footer { color: ${DARK.footerText} !important; }
  }
  @media (max-width: 480px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; box-sizing: border-box; }
    .head-name { font-size: 15px !important; }
  }
</style>`;
}

// Builds one email from the shared blocks. `tone` is green, coral, amber or blue. `details` are [[label, value]]; `cta` is { label, url } or null.
// Returns { html, text }.
function buildEmail({ headline, tone = 'blue', label, preheader, paragraphs = [], details = [], next = null, cta = null, signInLine = true }) {
  const t = TONES[tone] || TONES.blue;
  const preheaderText = String(preheader || '').slice(0, 140);
  const ctaBlock = cta
    ? `${button(cta.label, cta.url)}
        <p class="t-muted" style="margin:0 0 22px;font-size:12px;line-height:1.5;color:${LIGHT.muted};word-break:break-all;">If the button does not work, open this address: <a class="t-link" href="${escapeHtml(cta.url)}" style="color:${LIGHT.link};">${escapeHtml(cta.url)}</a></p>`
    : '';
  const nextBlock = next
    ? `<p class="t-body" style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${LIGHT.body};"><strong class="t-head" style="color:${LIGHT.head};">What happens next:</strong> ${escapeHtml(next)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(headline)}</title>
${darkCss()}
<!--[if mso]><style>table,td,div,p,a{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body class="bg" style="margin:0;padding:0;background:${LIGHT.page};font-family:${FONT};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${LIGHT.page};">${escapeHtml(preheaderText)}${'&nbsp;&zwnj;'.repeat(20)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="bg" style="background:${LIGHT.page};"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="container card" style="width:600px;max-width:600px;background:${LIGHT.card};border-radius:14px;overflow:hidden;">
      <tr><td style="background:${NAVY};padding:18px 28px;" class="px" bgcolor="${NAVY}">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td valign="middle" style="background:#ffffff;border-radius:10px;padding:6px 10px;" bgcolor="#ffffff"><img src="cid:${LOGO_CID}" alt="${escapeHtml(LOGO_ALT)}" width="96" height="50" style="display:block;border:0;width:96px;height:50px;"></td>
          <td valign="middle" style="padding-left:14px;">
            <div class="head-name" style="font-family:${FONT};font-size:17px;line-height:1.25;font-weight:700;color:#ffffff;">${escapeHtml(company.name)}</div>
            <div style="font-family:${FONT};font-size:12px;letter-spacing:.08em;color:#cbd5e1;margin-top:2px;">CZAMS</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="height:5px;background:${t.bar};font-size:0;line-height:0;" bgcolor="${t.bar}">&nbsp;</td></tr>
      <tr><td class="px" style="padding:28px 28px 8px;">
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 14px;"><tr><td style="background:${t.chipBg};color:${t.chipText};border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;letter-spacing:.06em;" bgcolor="${t.chipBg}">${escapeHtml(label)}</td></tr></table>
        <h1 class="t-head" style="margin:0 0 12px;font-size:24px;line-height:1.25;color:${LIGHT.head};">${escapeHtml(headline)}</h1>
        ${paragraphs.map((p) => `<p class="t-body" style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${LIGHT.body};">${escapeHtml(p)}</p>`).join('\n        ')}
        ${detailsTable(details, tone)}
        ${nextBlock}
        ${ctaBlock}
      </td></tr>
      <tr><td class="footer px" style="padding:20px 28px 26px;background:${LIGHT.footerBg};border-top:1px solid ${LIGHT.rule};">
        <p class="t-footer" style="margin:0 0 6px;font-size:13px;line-height:1.6;font-weight:700;color:${LIGHT.footerText};">${escapeHtml(company.name)}</p>
        <p class="t-footer" style="margin:0 0 10px;font-size:13px;line-height:1.7;color:${LIGHT.footerText};">Tel. ${escapeHtml(company.phone)}<br>${escapeHtml(company.email)}<br>${escapeHtml(company.address)}<br>${escapeHtml(company.hours)}</p>
        <p class="t-footer" style="margin:0;font-size:12px;line-height:1.6;color:${LIGHT.footerText};">You are receiving this because of activity on your ${escapeHtml(company.short)} Aircon account. This message was sent automatically, so please do not reply to it. To reach us, call or email using the details above.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    `${company.name} (CZAMS)`,
    '',
    `[${label}] ${headline}`,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    ...(details.length > 0 ? [...details.map(([l, v]) => `${l}: ${v}`), ''] : []),
    ...(next ? [`What happens next: ${next}`, ''] : []),
    ...(cta ? [`${cta.label}: ${cta.url}`, ''] : []),
    ...(signInLine ? ['Sign in to your account to view more details.', ''] : []),
    '--',
    company.name,
    `Tel. ${company.phone}`,
    company.email,
    company.address,
    company.hours,
    '',
    `You are receiving this because of activity on your ${company.short} Aircon account. This message was sent automatically, so please do not reply to it. To reach us, call or email using the details above.`,
  ].join('\n');

  return { html, text };
}

// ---- notification emails ---------------------------------------------------------------------------------------------------------------

// headline and color by notification type (kept for callers that only need the look)
function lookOf(type) {
  const { headline, tone } = contentOf(type);
  return { headline, color: TONES[tone].bar };
}

// { html, text } for one notification. `message` is the in-app sentence (one or two sentences). `appUrl` (optional) is the address of the
// website, for the button. `booking` (optional) is the booking the notification is about, for the details table; without it the booking number
// is read from the message. `recipientRole` picks which page the button opens.
function renderNotificationEmail({ type, message, appUrl, booking, recipientRole = 'customer' }) {
  const content = contentOf(type);
  const bookingId = booking?.bookingId || (String(message).match(BOOKING_NUMBER) || [])[0];
  const url = bookingUrl(appUrl, bookingId, recipientRole);
  return buildEmail({
    headline: content.headline,
    tone: content.tone,
    label: content.label,
    preheader: content.preheader,
    paragraphs: [String(message)],
    details: detailRows({ type, bookingId, booking }),
    next: content.next,
    cta: url ? { label: bookingId ? 'View booking' : 'Open CZAMS', url } : null,
  });
}

module.exports = { renderNotificationEmail, buildEmail, lookOf, detailRows, addressArea, bookingUrl, LOGO_CID, LOGO_FILE, LOGO_ALT, TONES, LIGHT, DARK, COLOR_PAIRS };
