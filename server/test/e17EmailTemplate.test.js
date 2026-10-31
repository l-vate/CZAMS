// Run with: npm test (inside server/). E17-8: every notification email is built by one shared layout with the same blocks, the company logo is
// attached inline (cid), dynamic text is escaped, nothing secret appears in a link or the body (except the password reset link, which is
// unchanged), every email has a plain text twin, subjects are unchanged, and all text meets WCAG AA contrast. No database, no mail server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');

const User = require('../models/User');
const EmailDelivery = require('../models/EmailDelivery');
const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { renderNotificationEmail, LOGO_CID, LOGO_FILE, LOGO_ALT, COLOR_PAIRS, detailRows, addressArea, bookingUrl } = require('../utils/emailTemplate');
const { KINDS } = require('../utils/emailContent');
const { EMAIL_NOTIFICATION_TYPES, queueNotificationEmail, buildMessage } = require('../utils/emailDelivery');
const { renderResetEmail, resetLink } = require('../utils/passwordReset');
const company = require('../utils/companyInfo');
const { chain } = require('./helpers/memoryQueries');

const APP_URL = 'https://app.example.test';
const ALL_TYPES = Object.values(NOTIFICATION_TYPE);
const booking = (over = {}) => ({
  bookingId: 'CZ-2026-0001', status: 'Approved', date: '2026-11-12', time: 'Morning', address: '12 Sample Street, Barangay Example, Quezon City, Metro Manila',
  service: { name: 'Installation', serviceType: 'Installation', price: 5000, unitTypePricing: [] }, units: [{ type: 'Split Type', quantity: 1, hp: '1', brand: 'Daikin' }],
  downPaymentPercent: 30, discount: { status: 'None' }, scopeLines: [], refund: { status: 'Pending', downPaymentAmount: 1500, refundableAmount: 1500 }, ...over,
});
const render = (type, extra = {}) => renderNotificationEmail({ type, message: `Booking CZ-2026-0001 update for ${type}.`, appUrl: APP_URL, booking: booking(), ...extra });

test('every kind that is emailed has content in the shared set, and the count is the known 39', () => {
  assert.equal(EMAIL_NOTIFICATION_TYPES.size, 39);
  for (const type of EMAIL_NOTIFICATION_TYPES) assert.ok(KINDS[type], `${type} has no content`);
});

test('every kind renders with the shared layout and every required block', () => {
  for (const type of ALL_TYPES) {
    const { html, text } = render(type);
    const [headline, , label] = KINDS[type];
    assert.ok(html.includes(`<title>${headline}</title>`), `${type}: headline`);
    assert.ok(html.includes(label), `${type}: status label`);
    assert.match(html, /display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all/, `${type}: hidden preheader`);
    assert.match(html, /<meta name="color-scheme" content="light dark">/, `${type}: dark mode meta`);
    assert.match(html, /prefers-color-scheme: dark/, `${type}: dark mode styles`);
    assert.match(html, /max-width:600px/, `${type}: 600 px container`);
    assert.match(html, /max-width: 480px/, `${type}: fluid on a phone`);
    assert.ok(html.includes(`src="cid:${LOGO_CID}"`), `${type}: logo`);
    assert.ok(html.includes(`alt="${LOGO_ALT}"`), `${type}: logo alt text`);
    assert.ok(html.includes(`>${company.name}<`), `${type}: the name next to the logo, for clients that block images`);
    assert.match(html, /<!--\[if mso\]><v:roundrect/, `${type}: Outlook button`);
    assert.ok(html.includes('View booking'), `${type}: View booking`);
    assert.ok(html.includes('If the button does not work, open this address'), `${type}: the address as plain text`);
    for (const fact of [company.phone, company.email, company.address, company.hours]) assert.ok(html.includes(fact), `${type}: footer has ${fact}`);
    assert.ok(html.includes('please do not reply'), `${type}: reason line`);
    assert.ok(text.includes(label) && text.includes(headline), `${type}: text version has the label and headline`);
    assert.ok(text.includes(company.phone) && text.includes(company.hours), `${type}: text version footer`);
  }
});

test('"What happens next" appears where the kind has one, and not where it does not', () => {
  assert.match(render(NOTIFICATION_TYPE.BOOKING_APPROVED).html, /What happens next:/);
  assert.match(render(NOTIFICATION_TYPE.UNIT_REQUEST_DECLINED).text, /What happens next: Your booking has not been cancelled/);
  assert.doesNotMatch(render(NOTIFICATION_TYPE.PAYMENT_VERIFIED).html, /What happens next/);
});

test('each kind has a status tone: green for approved or paid, coral for cancelled or declined, amber for pending, blue for information', () => {
  const tone = (type) => KINDS[type][1];
  for (const t of ['booking_approved', 'payment_verified', 'refund_processed', 'booking_completed']) assert.equal(tone(t), 'green', t);
  for (const t of ['booking_cancelled', 'unit_request_declined', 'payment_rejected', 'reschedule_denied']) assert.equal(tone(t), 'coral', t);
  for (const t of ['booking_created', 'payment_submitted', 'refund_requested']) assert.equal(tone(t), 'amber', t);
  for (const t of ['booking_in_progress', 'job_assigned', 'service_reminder']) assert.equal(tone(t), 'blue', t);
});

test('the details table has only the fields that apply, area only (never the street), and an amount only where money is involved', () => {
  const approved = detailRows({ type: 'booking_approved', bookingId: 'CZ-2026-0001', booking: booking() });
  assert.deepEqual(approved.map((r) => r[0]), ['Booking number', 'Service', 'Unit', 'Date and time', 'Area', 'Status']);
  assert.equal(approved.find((r) => r[0] === 'Unit')[1], '1x Split Type, 1 HP, Daikin');
  assert.equal(approved.find((r) => r[0] === 'Date and time')[1], 'Thu, Nov 12, 2026, Morning');
  assert.equal(approved.find((r) => r[0] === 'Area')[1], 'Quezon City, Metro Manila');
  const paid = detailRows({ type: 'payment_verified', bookingId: 'CZ-2026-0001', booking: booking() });
  assert.equal(paid.find((r) => r[0] === 'Total')[1], '₱5,000');
  const refund = detailRows({ type: 'refund_processed', bookingId: 'CZ-2026-0001', booking: booking() });
  assert.equal(refund.find((r) => r[0] === 'Refund')[1], '₱1,500');
  assert.equal(approved.some((r) => r[0] === 'Total' || r[0] === 'Refund'), false);
  const html = render('booking_approved').html;
  assert.equal(html.includes('12 Sample Street'), false, 'no street address');
  assert.equal(addressArea('Quezon City'), 'Quezon City');
  assert.deepEqual(detailRows({ type: 'booking_approved', bookingId: undefined, booking: undefined }), [], 'no booking, no table');
});

test('the button goes to the booking page for the recipient, with no token or secret, and Open CZAMS when there is no booking', () => {
  assert.equal(bookingUrl(APP_URL, 'CZ-2026-0001', 'customer'), `${APP_URL}/customer/book_details/CZ-2026-0001`);
  assert.equal(bookingUrl(APP_URL, 'CZ-2026-0001', 'admin'), `${APP_URL}/admin/services/requests/CZ-2026-0001`);
  assert.equal(bookingUrl(APP_URL, 'CZ-2026-0001', 'staff'), `${APP_URL}/staff/my_jobs`);
  assert.equal(bookingUrl('javascript:alert(1)', 'CZ-2026-0001', 'customer'), null);
  assert.equal(bookingUrl('', 'CZ-1', 'customer'), null);
  const noBooking = renderNotificationEmail({ type: 'payment_verified', message: 'Paid.', appUrl: APP_URL });
  assert.match(noBooking.html, />Open CZAMS</);
  assert.equal(noBooking.html.includes('View booking'), false);
  assert.equal(renderNotificationEmail({ type: 'payment_verified', message: 'Paid.' }).html.includes('Open CZAMS'), false, 'no button without a website address');
  for (const type of ALL_TYPES) {
    const links = [...render(type).html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith('http'));
    assert.ok(links.length > 0);
    links.forEach((u) => assert.equal(/[?#=]|token|password|secret/i.test(u), false, `${type}: ${u}`));
  }
});

test('dynamic text is escaped everywhere in the HTML', () => {
  const evil = '<img src=x onerror=alert(1)> & "quotes"';
  const b = booking({ service: { name: evil }, address: `${evil}, ${evil}`, units: [{ type: evil, quantity: 1, brand: evil }], status: evil });
  for (const type of ['booking_approved', 'payment_verified', 'refund_processed']) {
    const { html } = renderNotificationEmail({ type, message: evil, appUrl: APP_URL, booking: b });
    assert.equal(html.includes('<img src=x'), false, type);
    assert.equal(html.includes('onerror=alert(1)>'), false, type);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  }
});

test('no private data and no secret reaches an email: not the ID photo, the payment reference, a password or a token', () => {
  const b = booking({
    discount: { status: 'Pending', idPhoto: '/uploads/id/secret-id-photo.png' }, referenceNumber: '1234567890123', proofFile: '/uploads/proofs/secret-proof.png',
    password: 'hunter2-secret', token: 'TOKEN-SHOULD-NOT-APPEAR', customer: { name: 'Another Person', phone: '0999 000 1111', email: 'someone.else@example.com' },
  });
  for (const type of ALL_TYPES) {
    const { html, text } = renderNotificationEmail({ type, message: 'Booking CZ-2026-0001 update.', appUrl: APP_URL, booking: b });
    for (const leak of ['secret-id-photo', '1234567890123', 'secret-proof', 'hunter2', 'TOKEN-SHOULD-NOT', 'Another Person', '0999 000 1111', 'someone.else']) {
      assert.equal(html.includes(leak) || text.includes(leak), false, `${type} leaks ${leak}`);
    }
  }
});

test('every email has a plain text version with the same information, and the address of the button', () => {
  for (const type of ALL_TYPES) {
    const { text } = render(type);
    assert.ok(text.length > 100);
    assert.ok(text.includes('CZ-2026-0001'));
    assert.ok(text.includes(`View booking: ${APP_URL}/customer/book_details/CZ-2026-0001`), `${type}: the button address is in the text`);
    assert.ok(text.includes('Sign in to your account to view more details.'));
    assert.equal(/<[a-z][^>]*>/i.test(text), false, `${type}: no markup in the text version`);
  }
});

test('the logo is attached inline as a CID, and a message without the logo carries no attachment', async () => {
  const { html, text } = render('booking_approved');
  const message = buildMessage({ recipientEmail: 'a@example.test', subject: 'CZAMS: Booking Approved', text, html }, { from: 'CZAMS <noreply@example.test>' });
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0].cid, LOGO_CID);
  assert.equal(message.attachments[0].filename, LOGO_FILE);
  assert.equal(message.attachments[0].contentDisposition, 'inline');
  assert.ok(fs.existsSync(message.attachments[0].path));
  assert.equal(buildMessage({ recipientEmail: 'a@example.test', subject: 's', text: 't', html: '<p>no logo</p>' }, { from: 'x@example.test' }).attachments, undefined);

  // through a real MIME build, with a JSON transport: nothing is sent
  const sent = JSON.parse((await nodemailer.createTransport({ jsonTransport: true }).sendMail(message)).message);
  assert.ok(sent.text && sent.html, 'multipart: text and html together');
  assert.equal(sent.attachments.length, 1);
  assert.equal(sent.attachments[0].cid, LOGO_CID);
  assert.ok(sent.attachments[0].content.length > 1000, 'the PNG bytes travel with the message');
});

test('the email logo is the company logo at 240 px wide and small', () => {
  const file = path.join(__dirname, '..', 'assets', LOGO_FILE);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.readUInt32BE(16), 240, 'width');
  assert.equal(bytes.readUInt32BE(20), 124, 'height keeps the logo shape (484 x 251)');
  assert.ok(bytes.length < 20000, `${bytes.length} bytes`);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
});

test('the queue is unchanged: subjects, recipients and one email per notification', async () => {
  const saved = { SMTP_HOST: process.env.SMTP_HOST, SMTP_FROM: process.env.SMTP_FROM };
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_FROM = 'noreply@example.test';
  const created = [];
  const realFind = User.findById;
  const realCreate = EmailDelivery.create;
  User.findById = () => chain({ email: 'cust@example.test', role: 'customer' });
  EmailDelivery.create = async (doc) => { created.push(doc); return doc; };
  try {
    for (const type of EMAIL_NOTIFICATION_TYPES) {
      await queueNotificationEmail('CUS1', type, 'Booking CZ-2026-0001 update.', `N-${type}`, { ...process.env, APP_URL }, booking());
    }
    assert.equal(created.length, 39, 'one email per notification');
    const titleCase = (type) => `CZAMS: ${type.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')}`;
    [...EMAIL_NOTIFICATION_TYPES].forEach((type, i) => {
      assert.equal(created[i].subject, titleCase(type), `subject of ${type}`);
      assert.equal(created[i].recipientEmail, 'cust@example.test');
      assert.ok(created[i].html.includes('cid:czams-logo') && created[i].text.length > 0);
    });
    assert.equal(await queueNotificationEmail('CUS1', 'chat_message', 'hi', 'N-chat', { ...process.env, APP_URL }), null, 'a kind that is not emailed still is not');

    // an admin recipient gets the button for the admin booking page
    User.findById = () => chain({ email: 'admin@example.test', role: 'admin' });
    created.length = 0;
    await queueNotificationEmail('ADM1', 'booking_new', 'Booking CZ-2026-0001 new.', 'N-admin', { ...process.env, APP_URL }, booking());
    assert.ok(created[0].html.includes(`${APP_URL}/admin/services/requests/CZ-2026-0001`));
  } finally {
    User.findById = realFind;
    EmailDelivery.create = realCreate;
    Object.entries(saved).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  }
});

test('the header is light with the logo as it is: no white plate, a brand bar under it, a soft white card for the logo in dark mode only', () => {
  for (const type of Object.keys(KINDS)) {
    const { html } = render(type);
    const header = html.slice(html.indexOf('class="px head-bg"'), html.indexOf('brand-bar'));
    assert.ok(header.includes('class="px head-bg"'), `${type}: a light header cell`);
    assert.match(header, /background:#ffffff;padding:20px 28px 18px/, `${type}: white header`);
    assert.doesNotMatch(header, /background:#0b2545/, `${type}: no navy band`);
    assert.match(header, /<td valign="middle" class="logo-cell" style="padding:0;"><img src="cid:czams-logo"/, `${type}: the logo has no plate of its own`);
    assert.doesNotMatch(header, /border-radius:10px/, `${type}: no white box around the logo`);
    assert.match(header, /class="head-name t-head"[^>]*color:#0b2545/, `${type}: navy brand name`);
    assert.match(html, /class="brand-bar"[\s\S]*#e8553a[\s\S]*<td style="height:5px;background:#/, `${type}: coral and navy bar, then the status accent`);
    assert.match(html, /.logo-cell { background-color: #ffffff !important; border-radius: 12px !important;/, `${type}: soft white card in dark mode`);
    assert.match(html, /.head-bg { background-color: #111c30 !important; }/, `${type}: dark header`);
  }
});

// WCAG relative luminance and contrast ratio
const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('every text and background pair meets WCAG AA (4.5 to 1), in light and dark mode', () => {
  assert.ok(COLOR_PAIRS.length >= 20);
  for (const [name, fg, bg] of COLOR_PAIRS) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}`);
});

test('the password reset email uses the same layout and keeps its link exactly as it was', () => {
  const link = resetLink(APP_URL, 'a'.repeat(64));
  assert.equal(link, `${APP_URL}/reset-password#token=${'a'.repeat(64)}`);
  const { subject, html, text } = renderResetEmail({ link });
  assert.equal(subject, 'CZAMS: Reset your password');
  assert.ok(html.includes(`cid:${LOGO_CID}`) && html.includes(company.phone) && html.includes('PASSWORD RESET'));
  assert.ok(html.includes(`href="${link}"`), 'the button carries the link');
  assert.ok(text.includes(link) && /expires in 30 minutes/.test(text));
  assert.equal(html.split('#token=').length - 1 >= 1, true);
  // no other email carries a token
  for (const type of ALL_TYPES) assert.equal(render(type).html.includes('#token='), false);
});

test('the preview script renders one sample of every kind with fake data and writes no secret', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'previewEmails.js'), 'utf8');
  assert.match(src, /e17-email-previews/);
  assert.match(src, /SAMPLE-NOT-A-REAL-TOKEN/);
  assert.equal(/nodemailer|sendMail|createTransport/.test(src), false, 'it can never send');
  assert.equal(/\u2014/.test(src), false);
});

// E23: the details block is a left aligned two column table that stays two columns on a phone.
test('the details table is left aligned, two columns (label and value) on every row, and never stacks on a phone', () => {
  for (const type of ALL_TYPES) {
    const { html } = render(type);
    const table = (html.match(/<table[^>]*class="detail-box"[\s\S]*?<\/table>/) || [])[0];
    assert.ok(table, `${type}: has a details table`);
    const rows = table.match(/<tr>[\s\S]*?<\/tr>/g);
    assert.ok(rows.length >= 1);
    rows.forEach((row) => {
      assert.equal((row.match(/<td /g) || []).length, 2, `${type}: two cells per row`);
      assert.match(row, /class="detail-label[^"]*"[^>]*align="left"/, `${type}: label column, left`);
      assert.match(row, /class="detail-value[^"]*"[^>]*align="left"/, `${type}: value column, left`);
    });
    assert.equal(/text-align:center/.test(table), false, `${type}: nothing in the details is centered`);
    assert.equal(/class="[^"]*\bstack\b/.test(html), false, `${type}: no cell turns into a stacked block`);
    assert.equal(/\.detail-label[^}]*display\s*:\s*block/.test(html), false);
    assert.match(table, /border-left:3px solid/, `${type}: the accent is a thin left border`);
  }
});

test('the details table has one divider between items and none between a label and its value', () => {
  const { html } = render(NOTIFICATION_TYPE.PAYMENT_VERIFIED);
  const table = html.match(/<table[^>]*class="detail-box"[\s\S]*?<\/table>/)[0];
  const rows = table.match(/<tr>[\s\S]*?<\/tr>/g);
  assert.equal(/border-top/.test(rows[0]), false, 'no line above the first item');
  rows.slice(1).forEach((row) => {
    const [label, value] = row.match(/<td [\s\S]*?<\/td>/g);
    assert.match(label, /border-top:1px solid/);
    assert.match(value, /border-top:1px solid/); // the same line, drawn by both cells of one row
  });
  assert.equal(/border-bottom/.test(table), false, 'no line under a label');
});

test('the label is small and muted, the value larger and bold', () => {
  const { html } = render(NOTIFICATION_TYPE.BOOKING_APPROVED);
  const label = html.match(/<td class="detail-label[^>]*style="([^"]*)"/)[1];
  const value = html.match(/<td class="detail-value[^>]*style="([^"]*)"/)[1];
  const size = (s) => Number(s.match(/font-size:(\d+)px/)[1]);
  assert.ok(size(label) >= 12 && size(label) <= 13);
  assert.ok(size(value) >= 15 && size(value) <= 16);
  assert.match(label, /text-transform:uppercase/);
  assert.match(value, /font-weight:700/);
  assert.match(value, /overflow-wrap:anywhere/, 'a long value wraps inside its column');
});

test('only the logo, the headline and the button are centered in the body, and the body text is left aligned', () => {
  const { html } = render(NOTIFICATION_TYPE.BOOKING_APPROVED);
  assert.match(html, /<h1[^>]*text-align:center/);
  assert.match(html, /<p class="t-body" style="margin:0 0 18px;font-size:16px/, 'paragraphs carry no centering');
  assert.match(html, /<td class="px" align="left"[^>]*text-align:left/);
  assert.match(html, /<p class="t-body" style="margin:0 0 22px;text-align:left/, 'what happens next is left aligned');
});

test('details escape markup in their values and the dark mode rule color is set for the dividers', () => {
  const { html } = render(NOTIFICATION_TYPE.BOOKING_APPROVED, { booking: booking({ service: { name: '<b>x</b>', price: 1 } }) });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
  assert.match(html, /\.d-rule \{ border-top-color: #233554 !important; \}/);
});
