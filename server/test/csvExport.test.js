// Run with: npm test (inside server/). Tests the browser CSV helper, which has no browser-only imports.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'csvExport.js')).href);

test('a comma, a quote and a line break are wrapped in quotes with quotes doubled', async () => {
  const { csvCell } = await load();
  assert.equal(csvCell('Cruz, Ana'), '"Cruz, Ana"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a\nb'), '"a\nb"');
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(0), '0');
});

test('text that starts like a formula gets a single quote prefix', async () => {
  const { csvCell } = await load();
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+SUM(A1)'), "'+SUM(A1)");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('-2+3'), "'-2+3");
  assert.equal(csvCell('=HYPERLINK("x","y")'), `"'=HYPERLINK(""x"",""y"")"`);
  assert.equal(csvCell(-5), '-5');
});

test('the file has a BOM, the header, every row and the totals row', async () => {
  const { buildCsv } = await load();
  const csv = buildCsv({ columns: ['Name', 'Amount'], rows: [['A, B', '₱1,200'], ['=1+1', 3]], totalRow: ['Total', 'x'] });
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.deepEqual(csv.slice(1).split('\r\n'), ['Name,Amount', '"A, B","₱1,200"', "'=1+1,3", 'Total,x', '']);
});

test('the file name carries the report, the period and the date basis', async () => {
  const { csvFilename } = await load();
  assert.equal(csvFilename('payments', { fromKey: '2026-09-01', toKey: '2026-09-30', dateBasis: 'requested' }),
    'CZAMS_payments_2026-09-01_2026-09-30_requested.csv');
});

test('footer rows (such as the outstanding balance) are written after the totals row', async () => {
  const { buildCsv } = await load();
  const csv = buildCsv({ columns: ['A', 'B'], rows: [['1', '2']], totalRow: ['Total', '2'], footerRows: [['Outstanding balance', '5']] });
  assert.deepEqual(csv.slice(1).split('\r\n'), ['A,B', '1,2', 'Total,2', 'Outstanding balance,5', '']);
});
