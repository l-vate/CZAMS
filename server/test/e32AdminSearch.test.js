// Run with: npm test (inside server/). The admin search boxes look in the customer's name, email and phone, the booking number, the reference
// numbers and the technicians, in any letter case, on data the page already loaded. No endpoint was added. No database; Vite loads the helper.
const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

let vite;
let closeVite;
before(async () => { ({ vite, close: closeVite } = await startSsrServer()); });
after(async () => { await closeVite(); });
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const load = () => vite.ssrLoadModule('/src/utils/adminSearch.js');

const customer = { name: 'Maria Dela Cruz', email: 'Maria.Cruz@Example.com', phone: '+63 917-123-4567' };
const parts = (extra = []) => ['CZ-2026-1234', 'Aircon Cleaning', ...(extra), 'Tech Ramon'];

test('a name, an email, a booking number, a reference number or a technician finds the row, in any letter case', async () => {
  const { matchesSearch, customerSearchParts } = await load();
  const row = parts([...customerSearchParts(customer), '1234567890123']);
  ['maria', 'DELA CRUZ', 'maria.cruz@example', 'EXAMPLE.COM', 'cz-2026-1234', '1234567890123', 'ramon', 'cleaning'].forEach((q) => assert.equal(matchesSearch(q, row), true, q));
  assert.equal(matchesSearch('nobody here', row), false);
  assert.equal(matchesSearch('', row), true);
  assert.equal(matchesSearch('   ', row), true);
});

test('a phone number is found however it is typed', async () => {
  const { matchesSearch, customerSearchParts } = await load();
  const row = customerSearchParts(customer);
  ['917', '917-123', '0917 123'.replace('0917', '917'), '+63 917', '(917) 123 4567', '9171234567'].forEach((q) => assert.equal(matchesSearch(q, row), true, q));
  assert.equal(matchesSearch('918', row), false);
});

test('digits are never matched across two fields, and a short number is not read as a phone', async () => {
  const { matchesSearch } = await load();
  assert.equal(matchesSearch('2345', ['12', '34 5']), false);
  assert.equal(matchesSearch('12', ['CZ-2026-1234']), true); // plain text match still works
  assert.equal(matchesSearch('99', ['+63 917 9912']), true);
});

test('a missing customer, a deleted customer and empty fields never break a search', async () => {
  const { matchesSearch, customerSearchParts } = await load();
  assert.deepEqual(customerSearchParts(null), []);
  assert.deepEqual(customerSearchParts('abc123'), []);
  assert.equal(matchesSearch('x', [undefined, null, '', 0]), false);
  assert.equal(matchesSearch('0', [undefined, 0]), true);
});

test('each admin page uses the shared search and says what can be searched', () => {
  [['payments', /name, email, phone, booking no\. or reference no/], ['back_jobs', /name, email, phone or booking no/], ['manage_accounts', /name, ID, email or phone/],
    ['service_requests', /booking no\., customer, email, phone, reference no\. or technician/], ['service_reports', /booking no\., customer, email, phone or technician/]].forEach(([page, placeholder]) => {
    const source = read(`pages/admin/${page}.jsx`);
    assert.match(source, /utils\/adminSearch/, page);
    assert.match(source, placeholder, page);
  });
});

test('the payments search covers the reference numbers, and no new endpoint was added for any search', () => {
  const payments = read('pages/admin/payments.jsx');
  assert.match(payments, /payment\.raw\?\.referenceNumber, payment\.raw\?\.balanceReferenceNumber/);
  assert.match(payments, /customerSearchParts\(payment\.raw\?\.customer\)/);
  assert.doesNotMatch(read('utils/adminSearch.js'), /fetch\(|request\(/);
});
