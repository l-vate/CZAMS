// Run with: npm test (inside server/). A booking can outlive its customer: deleting an account removes only the user record, so the
// booking is loaded with `customer: null`. Every screen that shows the customer says "Deleted customer" then, never a blank, "-",
// "Customer" or "undefined". The admin API sends null; the technician's view of the booking carries the name itself. No database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { toTechnicianView } = require('../utils/technicianView');
const { startSsrServer } = require('./helpers/viteSsr');

const root = path.join(__dirname, '..', '..', 'src');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('a technician sees "Deleted customer" for a booking whose customer is gone, and nothing invented otherwise', () => {
  const gone = toTechnicianView({ bookingId: 'CZ-1', customer: null });
  assert.deepEqual(gone.customer, { name: 'Deleted customer', phone: '' });
  const present = toTechnicianView({ bookingId: 'CZ-2', customer: { _id: 'C1', name: 'Ana', phone: '0917', email: 'a@b.c' } });
  assert.deepEqual(present.customer, { name: 'Ana', phone: '0917' }, 'the email never reaches a technician');
  assert.equal(toTechnicianView({ bookingId: 'CZ-3' }).customer, undefined, 'a booking loaded without its customer shows no customer');
  assert.equal(toTechnicianView({ bookingId: 'CZ-4', customer: 'C1' }).customer, undefined);
});

test('the invoice made from a booking with no customer is made out to "Deleted customer"', async () => {
  const { vite, close } = await startSsrServer();
  const { customerLabel } = await vite.ssrLoadModule('/src/utils/customerLabel.js');
  const { buildReceiptForm } = await vite.ssrLoadModule('/src/utils/receiptData.js');
  await close();
  const form = buildReceiptForm({ bookingId: 'CZ-1', customer: null, units: [] }, { customerName: customerLabel(null, '-'), contactNumber: '' });
  assert.equal(form.customerName, 'Deleted customer');
});

test('the invoice, the report viewer and the booking search read the customer through the label', () => {
  const files = ['components/admin_service_details_modal.jsx', 'pages/admin/payments.jsx', 'components/service_report_viewer.jsx', 'pages/admin/service_requests.jsx'];
  files.forEach((f) => assert.match(read(f), /customerLabel\(/, `${f} should read the customer through customerLabel`));
  assert.equal(/customerName: [a-zA-Z.]*customer\?\.name/.test(read('components/admin_service_details_modal.jsx')), false);
  assert.equal(/customerName: [a-zA-Z.]*customer\?\.name/.test(read('pages/admin/payments.jsx')), false);
  assert.equal(/details\.customer\?\.name/.test(read('components/service_report_viewer.jsx')), false);
  assert.match(read('pages/admin/service_requests.jsx'), /customerLabel\(req\.customer, ''\)/, 'searching "deleted" finds these bookings');
});

test('the admin booking page has no distance charge input or Edit at all (E17-4): the Scope of works is the one place for it', () => {
  const text = read('components/admin_service_details_modal.jsx');
  assert.doesNotMatch(text, /Distance Based Charge \(₱\)/);
  assert.doesNotMatch(text, /distanceDraft/);
  assert.match(text, /legacyDistanceAmount/);
});
