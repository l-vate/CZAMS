// Run with: npm test (inside server/). How a deleted customer is shown on admin screens and exports.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'utils', 'customerLabel.js')).href);

test('a booking whose customer account is gone (null) shows "Deleted customer"', async () => {
  const { customerLabel, DELETED_CUSTOMER } = await load();
  assert.equal(DELETED_CUSTOMER, 'Deleted customer');
  assert.equal(customerLabel(null), 'Deleted customer');
  assert.equal(customerLabel(null, 'Customer'), 'Deleted customer');
});

test('a customer with a name shows the name', async () => {
  const { customerLabel } = await load();
  assert.equal(customerLabel({ name: 'Customer One', email: 'a@b.c' }), 'Customer One');
});

test('a booking loaded without its customer, or a customer with no name, uses the fallback, never "undefined"', async () => {
  const { customerLabel } = await load();
  assert.equal(customerLabel(undefined), 'N/A');
  assert.equal(customerLabel('CUS1'), 'N/A');
  assert.equal(customerLabel({ email: 'a@b.c' }), 'N/A');
  assert.equal(customerLabel({ name: '' }, 'Customer'), 'Customer');
  assert.equal(customerLabel(undefined, 'Customer'), 'Customer');
  ['null', 'undefined'].forEach((word) => assert.equal(String(customerLabel(undefined)).includes(word), false));
});

test('the admin screens use it: none of them is left showing a blank or N/A for a missing customer', () => {
  const fs = require('node:fs');
  const root = path.join(__dirname, '..', '..', 'src');
  const files = [
    'components/admin_service_details_modal.jsx', 'components/pending_queue.jsx', 'pages/admin/dashboard.jsx',
    'pages/admin/analytics.jsx', 'pages/admin/back_jobs.jsx', 'pages/admin/calendar.jsx', 'pages/admin/payments.jsx',
    'pages/admin/service_reports.jsx', 'pages/admin/chat.jsx', 'utils/reportBuilders.js',
  ];
  files.forEach((f) => {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(text, /customerLabel|DELETED_CUSTOMER/, `${f} should use the deleted customer label`);
    assert.equal(/customer\?\.name \|\| '(N\/A|Customer)'/.test(text), false, `${f} still shows N/A or Customer for a missing customer`);
  });
});
