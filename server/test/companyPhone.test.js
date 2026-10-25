// Run with: npm test (inside server/). The company phone lives in one place (src/config/company.js): the display value, the tel: link
// worked out from it, and no old placeholder number left in the frontend. Reads files only; nothing connects to a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..');

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return sourceFiles(full);
  return /\.jsx?$/.test(e.name) ? [full] : [];
});

test('COMPANY_PHONE is the confirmed number and the tel: link is derived from it', async () => {
  // company.js reads server/constants/company.json (which the notification emails read too), so it loads through Vite
  const { vite, close } = await startSsrServer();
  const company = await vite.ssrLoadModule('/src/config/company.js').finally(close);
  assert.equal(company.COMPANY_PHONE, '0918 499 3509');
  assert.equal(company.COMPANY_PHONE_TEL, 'tel:+639184993509');
});

test('no frontend file keeps an old placeholder number, and no file types the company number by hand', () => {
  const offenders = [];
  for (const file of sourceFiles(path.join(root, 'src'))) {
    if (file.endsWith(path.join('config', 'company.js'))) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/\+63 ?900 ?000 ?0000|0900 ?000 ?0000|0918 ?499 ?3509/.test(text)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, []);
});

test('the invoice and receipt, the Statement of Account, the report sheets and the landing footer all read COMPANY_PHONE', () => {
  ['components/receipt_modal.jsx', 'components/statement_of_account.jsx', 'components/report_sheet.jsx', 'components/service_report_pdf_modal.jsx', 'components/landing/landing_footer.jsx']
    .forEach((file) => {
      assert.match(fs.readFileSync(path.join(root, 'src', file), 'utf8'), /COMPANY_PHONE/, file);
    });
});
