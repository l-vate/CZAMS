/* eslint-disable no-console -- a preview script's output */
// Renders one sample of every kind of notification email (and the password reset email) with FAKE data, into e17-email-previews/ (ignored by
// git). Nothing is sent and nothing connects to a database or a mail server. With AUDIT_PLAYWRIGHT set to the path of playwright-core, it also
// takes a screenshot of each page at 600 and 390 px wide.
//
//   node scripts/previewEmails.js
//   AUDIT_PLAYWRIGHT=<path to playwright-core> node scripts/previewEmails.js
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { renderNotificationEmail, LOGO_FILE } = require('../utils/emailTemplate');
const { renderResetEmail } = require('../utils/passwordReset');
const { KINDS } = require('../utils/emailContent');

const OUT = path.join(__dirname, '..', '..', 'e17-email-previews');
const APP_URL = 'https://app.example.test';
const LOGO = fs.readFileSync(path.join(__dirname, '..', 'assets', LOGO_FILE)).toString('base64');

// fake data only
const FAKE_BOOKING = {
  bookingId: 'CZ-2026-0001', status: 'Approved', date: '2026-11-12', time: 'Morning', address: '12 Sample Street, Barangay Example, Quezon City, Metro Manila',
  service: { name: 'Installation', serviceType: 'Installation', price: 5000, unitTypePricing: [] },
  units: [{ type: 'Split Type', quantity: 1, hp: '1', brand: 'Daikin', brandModel: 'Daikin' }],
  downPaymentPercent: 30, discount: { status: 'None' }, scopeLines: [],
  refund: { status: 'Pending', downPaymentAmount: 1500, refundableAmount: 1500 },
};
const SAMPLE_MESSAGES = {
  unit_request_declined: 'Booking CZ-2026-0001: we do not have the unit you chose. Reason: we do not carry that brand. We do have Carrier and LG 1 HP splits. You can cancel this booking, or contact us.',
  booking_cancelled: 'Your booking CZ-2026-0001 was cancelled by our team because we cannot supply or serve it: we do not carry that brand. Your whole down payment will be refunded, with no transportation fee.',
  payment_rejected: 'The proof for booking CZ-2026-0001 could not be verified: the reference number did not match. Please send a new proof.',
};
const messageFor = (type) => SAMPLE_MESSAGES[type] || `Booking CZ-2026-0001 update (${type.replace(/_/g, ' ')}). This is sample text with fake data.`;

const forDisk = (html) => html.replace('cid:czams-logo', `data:image/png;base64,${LOGO}`);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const pages = [];
  Object.keys(KINDS).forEach((type) => {
    const { html, text } = renderNotificationEmail({ type, message: messageFor(type), appUrl: APP_URL, booking: FAKE_BOOKING });
    fs.writeFileSync(path.join(OUT, `${type}.html`), forDisk(html));
    fs.writeFileSync(path.join(OUT, `${type}.txt`), text);
    pages.push(type);
  });
  const reset = renderResetEmail({ link: `${APP_URL}/reset-password#token=SAMPLE-NOT-A-REAL-TOKEN` });
  fs.writeFileSync(path.join(OUT, 'password_reset.html'), forDisk(reset.html));
  fs.writeFileSync(path.join(OUT, 'password_reset.txt'), reset.text);
  pages.push('password_reset');
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email previews</title><ul>${pages.map((p) => `<li><a href="${p}.html">${p}</a></li>`).join('')}</ul>`);
  console.log(`Wrote ${pages.length} previews to e17-email-previews/ (fake data, nothing sent).`);

  if (!process.env.AUDIT_PLAYWRIGHT) return;
  const { chromium } = require(process.env.AUDIT_PLAYWRIGHT);
  const chrome = path.join(process.env.USERPROFILE || process.env.HOME || '', 'AppData', 'Local', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    for (const width of [600, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const name of pages) {
        await page.goto(pathToFileURL(path.join(OUT, `${name}.html`)).href);
        await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
      }
      await page.close();
    }
    console.log('Screenshots taken at 600 and 390 px.');
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error('Preview failed:', err.message); process.exit(1); });
