// Run with: npm test (inside server/). The official business name lives in one place (src/config/company.js). The constants have the exact
// wording, and no frontend file types the name or an old variant of it by hand. Reads files only; nothing connects to a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(jsx?|css)$/.test(e.name) ? [full] : [];
  });
}

test('the brand constants are the official name, the short form, and the second line', async () => {
  // company.js reads server/constants/company.json (also read by the notification emails), so it loads through Vite
  const { vite, close } = await startSsrServer();
  const brand = await vite.ssrLoadModule('/src/config/company.js').finally(close);
  assert.equal(brand.BRAND_NAME, 'Cooling Zone Aircon Maintenance Services');
  assert.equal(brand.BRAND_SHORT, 'Cooling Zone');
  assert.equal(brand.BRAND_NAME, `${brand.BRAND_SHORT} ${brand.BRAND_SUB}`);
});

test('no frontend file types the brand name by hand, and the old variants are gone', () => {
  const offenders = [];
  for (const file of sourceFiles(path.join(root, 'src'))) {
    if (file.endsWith(path.join('config', 'company.js'))) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/cooling zone/i.test(text)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, []);
});

test('the browser tab title is the official name', () => {
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /<title>Cooling Zone Aircon Maintenance Services<\/title>/);
});
