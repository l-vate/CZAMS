// Run with: npm test (inside server/). Choosing a customer in the walk-in booking fills in their contact number and, when the account has its address as separate
// parts, the address boxes (still editable). A one line address is never parsed, and changing or clearing the customer never leaves the last one's address behind.
// Nothing about a saved booking changes: the booking is still made from whatever is in the boxes at the end.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSsrServer } = require('./helpers/viteSsr');

const hospital = {
  _id: 'CUS9101', name: 'Sample Hospital', phone: '+63 917 000 0101', address: '123, Sample Street, Brgy. 306, Sta. Cruz, Manila, Metro Manila 1003',
  addressParts: { houseLot: '123', street: 'Sample Street', subdivision: '', barangay: 'Barangay 306, Sta. Cruz', city: 'Manila', province: 'Metro Manila', zip: '1003' },
};
const inn = {
  _id: 'CUS9102', name: 'Sample Inn', phone: '+63 917 000 0102', address: '45, Sample Avenue, Brgy. Sample Barangay, Quezon City, Metro Manila 1100',
  addressParts: { houseLot: '45', street: 'Sample Avenue', subdivision: '', barangay: 'Sample Barangay', city: 'Quezon City', province: 'Metro Manila', zip: '1100' },
};
const oneLine = { _id: 'CUS1', name: 'Older Client', phone: '09171234567', address: 'Blk 5 Lot 2, Mabini St, Quezon City' };
const EMPTY = { houseLot: '', street: '', subdivision: '', barangay: '', city: '', province: '', zip: '' };

let prefillFromCustomer;
test.before(async () => {
  const { vite, close } = await startSsrServer();
  ({ prefillFromCustomer } = await vite.ssrLoadModule('/src/utils/walkInPrefill.js').finally(close));
});

test('a customer with separate address parts fills the boxes, the address line and the contact number', () => {
  const filled = prefillFromCustomer(hospital);
  assert.deepEqual(filled.addressParts, hospital.addressParts);
  assert.equal(filled.contactNumber, '+63 917 000 0101');
  assert.equal(filled.address, hospital.address, 'the line is built from the parts, the same way every other screen does');
});

test('a customer with only a one line address gets empty boxes (the line is never parsed), but still gets the contact number', () => {
  const filled = prefillFromCustomer(oneLine);
  assert.deepEqual(filled.addressParts, EMPTY);
  assert.equal(filled.address, '');
  assert.equal(filled.contactNumber, '09171234567');
});

test('changing the customer replaces the address, and clearing the customer empties it: one client address never carries over to another', () => {
  let form = { ...prefillFromCustomer(hospital) };
  assert.equal(form.addressParts.city, 'Manila');
  form = { ...form, ...prefillFromCustomer(inn) };
  assert.equal(form.addressParts.city, 'Quezon City');
  assert.equal(form.addressParts.zip, '1100');
  form = { ...form, ...prefillFromCustomer(oneLine) };
  assert.deepEqual(form.addressParts, EMPTY, 'a client with no parts does not inherit the previous client address');
  form = { ...form, ...prefillFromCustomer(hospital) };
  form = { ...form, ...prefillFromCustomer(null) };
  assert.deepEqual(form.addressParts, EMPTY);
  assert.deepEqual([form.address, form.contactNumber], ['', '']);
});

test('the parts are copied, so editing the boxes can never change the customer record', () => {
  const filled = prefillFromCustomer(hospital);
  filled.addressParts.street = 'Edited Street';
  assert.equal(hospital.addressParts.street, 'Sample Street');
});

test('the walk-in form uses it when a customer is chosen, and what is saved is still what is in the boxes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'admin', 'walk_in_booking.jsx'), 'utf8');
  assert.match(source, /const chooseCustomer = \(c\) => \{\s*setCustomer\(c\);\s*setForm\(\(prev\) => \(\{ \.\.\.prev, \.\.\.prefillFromCustomer\(c\) \}\)\);/);
  assert.match(source, /formData\.append\('addressParts', JSON\.stringify\(form\.addressParts\)\);/);
});
