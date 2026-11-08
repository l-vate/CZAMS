// Run with: npm test (inside server/). E33: the address is entered as separate parts (House or Block and Lot, Street, Subdivision or
// Building, Barangay, City, Province, ZIP). One shared helper builds the single line that every other screen reads; the client and server
// copies agree. The server rejects a missing required part or a ZIP that is not 4 digits, the service area check runs on the built line,
// and an old record without parts keeps working with its old line.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const server = require('../utils/addressParts');
const limits = require('../constants/inputLimits.json');
const { isWithinServiceArea } = require('../utils/serviceArea');
const User = require('../models/User');
const { authCache } = require('../utils/authCache');
const { chain } = require('./helpers/memoryQueries');
const harness = require('./helpers/createBooking');

const root = path.join(__dirname, '..', '..');
// Node cannot import a .json file without an attribute, so the client file is loaded with that one import line swapped for the same numbers.
const loadClient = () => {
  const source = fs.readFileSync(path.join(root, 'src', 'utils', 'addressParts.js'), 'utf8')
    .replace(/^import limits from .*$/m, `const limits = ${JSON.stringify(limits)};`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

const GOOD = { houseLot: 'Blk 5 Lot 12', street: 'Mabini St.', subdivision: 'Sunrise Homes', barangay: 'Holy Spirit', city: 'Quezon City', province: 'Metro Manila', zip: '1127' };

// ---- the helper
test('the built line has a fixed order: house, street, subdivision, Brgy., city, province and ZIP', () => {
  assert.equal(server.buildAddress(GOOD), 'Blk 5 Lot 12, Mabini St., Sunrise Homes, Brgy. Holy Spirit, Quezon City, Metro Manila 1127');
});

test('the optional subdivision is left out of the line when empty', () => {
  assert.equal(server.buildAddress({ ...GOOD, subdivision: '' }), 'Blk 5 Lot 12, Mabini St., Brgy. Holy Spirit, Quezon City, Metro Manila 1127');
  assert.equal(server.buildAddress({ ...GOOD, subdivision: '   ' }), 'Blk 5 Lot 12, Mabini St., Brgy. Holy Spirit, Quezon City, Metro Manila 1127');
});

test('the line ends with "City, Province ZIP", which the emails show as the area (never the street)', () => {
  const parts = server.buildAddress(GOOD).split(',').map((p) => p.trim());
  assert.equal(parts.slice(-2).join(', '), 'Quezon City, Metro Manila 1127');
});

test('Brgy. is not doubled and spaces are tidied', () => {
  assert.equal(server.buildAddress({ ...GOOD, barangay: 'Brgy. Holy Spirit' }), server.buildAddress(GOOD));
  assert.equal(server.buildAddress({ ...GOOD, barangay: 'barangay  Holy   Spirit' }), server.buildAddress(GOOD));
  assert.equal(server.buildAddress({ ...GOOD, street: '  Mabini   St. ' }), server.buildAddress(GOOD));
});

test('anything that is not an object builds an empty line, and unknown names are dropped', () => {
  assert.equal(server.buildAddress(null), '');
  assert.equal(server.buildAddress('text'), '');
  assert.deepEqual(Object.keys(server.cleanParts({ ...GOOD, extra: 'x', $where: '1' })).sort(), [...server.PART_KEYS].sort());
  assert.equal(server.cleanParts({ ...GOOD, street: { $ne: 1 } }).street, '');
});

test('parts may arrive as an object or as JSON text, and nothing else is accepted', () => {
  assert.deepEqual(server.readParts(GOOD), GOOD);
  assert.deepEqual(server.readParts(JSON.stringify(GOOD)), GOOD);
  for (const bad of [undefined, null, '', '   ', 'not json', '[1]', '"x"', 5, [GOOD]]) assert.equal(server.readParts(bad), null, String(bad));
});

test('the client and server copies build the same line and give the same verdicts', async () => {
  const client = await loadClient();
  const samples = [
    GOOD, { ...GOOD, subdivision: '' }, { ...GOOD, barangay: 'Brgy. 171' }, { ...GOOD, zip: '12' }, { ...GOOD, zip: '12345' }, { ...GOOD, zip: 'abcd' },
    { ...GOOD, street: '' }, { ...GOOD, houseLot: 'x'.repeat(limits.addressHouseLot + 1) }, { ...GOOD, street: 'x'.repeat(limits.addressStreet) },
    { ...GOOD, city: 'Other Town  Name' }, {}, null, undefined, 'text',
  ];
  samples.forEach((s) => {
    assert.equal(client.buildAddress(s), server.buildAddress(s), JSON.stringify(s));
    assert.equal(client.addressPartsProblem(s), server.addressPartsProblem(s), JSON.stringify(s));
    assert.equal(client.isBlankParts(s), server.isBlankParts(s), JSON.stringify(s));
    assert.deepEqual(client.cleanParts(s), server.cleanParts(s), JSON.stringify(s));
  });
  assert.deepEqual(client.PART_KEYS, server.PART_KEYS);
});

// ---- validation
test('a complete address passes, and the optional subdivision may be empty', () => {
  assert.equal(server.addressPartsProblem(GOOD), null);
  assert.equal(server.addressPartsProblem({ ...GOOD, subdivision: '' }), null);
});

test('each required part is refused when missing or blank, with its own message', () => {
  const labels = { houseLot: 'House or Block and Lot', street: 'Street', barangay: 'Barangay', city: 'City or Municipality', province: 'Province', zip: 'ZIP code' };
  Object.entries(labels).forEach(([key, label]) => {
    [undefined, '', '   '].forEach((value) => {
      assert.equal(server.addressPartsProblem({ ...GOOD, [key]: value }), `${label} is required.`, `${key} ${JSON.stringify(value)}`);
    });
  });
  assert.equal(server.addressPartsProblem({}), 'House or Block and Lot is required.');
});

test('the ZIP code must be exactly 4 digits', () => {
  ['123', '12345', 'abcd', '12a4', '12 34', '1234.0', '-123'].forEach((zip) => {
    assert.equal(server.addressPartsProblem({ ...GOOD, zip }), 'ZIP code must be exactly 4 digits.', zip);
  });
  assert.equal(server.addressPartsProblem({ ...GOOD, zip: '0900' }), null, 'a leading zero is a real ZIP');
});

test('each part has its own length limit in inputLimits.json', () => {
  const keys = { houseLot: 'addressHouseLot', street: 'addressStreet', subdivision: 'addressSubdivision', barangay: 'addressBarangay', city: 'addressCity', province: 'addressProvince' };
  Object.entries(keys).forEach(([part, limitKey]) => {
    assert.ok(limits[limitKey] > 0, limitKey);
    assert.equal(server.addressPartsProblem({ ...GOOD, [part]: 'x'.repeat(limits[limitKey] + 1) }) !== null, true, `${part} over the limit`);
  });
  assert.equal(limits.addressZip, 4);
  assert.equal(limits.address, 300, 'the whole line keeps its 300 character cap');
});

test('a built line over 300 characters is refused even when every part is within its own limit', () => {
  const full = {
    houseLot: 'h'.repeat(limits.addressHouseLot), street: 's'.repeat(limits.addressStreet), subdivision: 'u'.repeat(limits.addressSubdivision),
    barangay: 'b'.repeat(limits.addressBarangay), city: 'c'.repeat(limits.addressCity), province: 'p'.repeat(limits.addressProvince), zip: '1234',
  };
  const line = server.buildAddress(full);
  assert.equal(server.addressPartsProblem(full) !== null, line.length > limits.address);
  const roomy = { ...full, houseLot: 'h'.repeat(limits.addressHouseLot), street: 's'.repeat(limits.addressStreet) };
  assert.ok(server.addressPartsProblem(roomy) === null || /300/.test(server.addressPartsProblem(roomy)));
});

// ---- the service area check (E33c: with parts it reads the city only, see e33ServiceArea.test.js; a line alone is read as before)
test('the service area check reads the built line when no parts are given, as it read the old line, and the city when they are', () => {
  assert.equal(isWithinServiceArea(server.buildAddress(GOOD)), true);
  assert.equal(isWithinServiceArea(server.buildAddress({ ...GOOD, city: 'Pasig City' })), true, 'a line alone: the old keywords');
  assert.equal(isWithinServiceArea(server.buildAddress({ ...GOOD, city: 'Pasig City' }), { ...GOOD, city: 'Pasig City' }), false, 'with parts: Quezon City and Manila only');
  assert.equal(isWithinServiceArea(server.buildAddress(GOOD), GOOD), true);
  assert.equal(isWithinServiceArea(server.buildAddress({ ...GOOD, city: 'Baguio City', province: 'Benguet', zip: '2600' })), false);
});

// ---- booking create through the real route
test('a booking is created from the parts: the line is built on the server and the parts are saved next to it', async () => {
  await harness.install();
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
    services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
  });
  try {
    const res = await harness.post({ addressParts: GOOD, address: 'A line the request made up' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const saved = harness.state.bookings[0];
    assert.equal(saved.address, server.buildAddress(GOOD), 'the line is built from the parts, never taken from the request');
    assert.deepEqual({ ...saved.addressParts }, server.cleanParts(GOOD));
  } finally {
    harness.close();
  }
});

test('a booking without parts, with a missing part, a bad ZIP or a too long part is a 400 and nothing is saved', async () => {
  await harness.install();
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
    services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
  });
  try {
    const cases = [
      [{ addressParts: undefined, address: 'Quezon City' }, /^Address is required/],
      [{ addressParts: { ...GOOD, barangay: '' } }, /^Barangay is required/],
      [{ addressParts: { ...GOOD, houseLot: '' } }, /^House or Block and Lot is required/],
      [{ addressParts: { ...GOOD, zip: '112' } }, /^ZIP code must be exactly 4 digits/],
      [{ addressParts: { ...GOOD, zip: '11270' } }, /^ZIP code must be exactly 4 digits/],
      [{ addressParts: { ...GOOD, street: 'x'.repeat(limits.addressStreet + 1) } }, /^Street must be \d+ characters or fewer/],
    ];
    for (const [fields, expected] of cases) {
      const res = await harness.post(fields);
      assert.equal(res.status, 400, JSON.stringify(fields).slice(0, 80));
      assert.match(res.body.message, expected);
    }
    assert.equal(harness.state.bookings.length, 0);
  } finally {
    harness.close();
  }
});

test('a booking outside the service area is still accepted and flagged, from the built line', async () => {
  await harness.install();
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
    services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
  });
  try {
    const res = await harness.post({ addressParts: { ...GOOD, city: 'Baguio City', province: 'Benguet', zip: '2600' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const saved = harness.state.bookings[0];
    assert.equal(saved.address, 'Blk 5 Lot 12, Mabini St., Sunrise Homes, Brgy. Holy Spirit, Baguio City, Benguet 2600');
    assert.equal(saved.serviceAreaCheck.withinArea, false, 'flagged for the admin, not refused');
  } finally {
    harness.close();
  }
});

// ---- an old booking without parts
test('an older booking has only its line: a customer still reads it, with no parts', async () => {
  await harness.install();
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
    services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
  });
  try {
    harness.addBooking({ bookingId: 'CZ-OLD', customer: 'CUS1', service: 'S-CLEAN', status: 'Approved', address: '12 Old Street, Brgy. Pinyahan, Quezon City', units: [{ type: 'Split Type', quantity: 1 }] });
    const own = await harness.call('GET', '/CZ-OLD', 'CUS1');
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.address, '12 Old Street, Brgy. Pinyahan, Quezon City');
    assert.equal(own.body.addressParts, undefined);
  } finally {
    harness.close();
  }
});

// ---- profile save
let users;
let httpServer;
let base;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  httpServer = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  base = `http://127.0.0.1:${httpServer.address().port}`;
});
test.after(() => httpServer && httpServer.close());
test.beforeEach(() => {
  // set again for each test: the booking tests above replace these with their own stand-ins
  User.findById = (id) => chain(users.find((u) => u._id === id) || null);
  User.findOne = (f) => chain(users.find((u) => !(f.email instanceof RegExp) || f.email.test(u.email)) || null);
  authCache.clear();
  users = [{
    _id: 'CUS7', name: 'Bea Lim', firstName: 'Bea', lastName: 'Lim', email: 'bea@example.com', phone: '09170000000', role: 'customer', isActive: true,
    address: '5 Old Road, Quezon City',
    save: async function save() { return this; },
  }];
});

const profile = (body) => fetch(`${base}/api/auth/profile`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: 'CUS7', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '5m' })}` },
  body: JSON.stringify({ firstName: 'Bea', lastName: 'Lim', email: 'bea@example.com', ...body }),
}).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) }));

test('profile: parts are saved, the line is built from them and both are returned', async () => {
  const res = await profile({ addressParts: GOOD, address: 'ignored line' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(users[0].address, server.buildAddress(GOOD));
  assert.deepEqual({ ...users[0].addressParts }, server.cleanParts(GOOD));
  assert.equal(res.body.user.address, server.buildAddress(GOOD));
  assert.deepEqual(res.body.user.addressParts, server.cleanParts(GOOD));
});

test('profile: a started address must be complete, with a 4 digit ZIP', async () => {
  const noZip = await profile({ addressParts: { ...GOOD, zip: '' } });
  assert.equal(noZip.status, 400);
  assert.match(noZip.body.message, /ZIP code is required/);
  const badZip = await profile({ addressParts: { ...GOOD, zip: '12' } });
  assert.equal(badZip.status, 400);
  assert.match(badZip.body.message, /exactly 4 digits/);
  assert.equal(users[0].address, '5 Old Road, Quezon City', 'a refused save changes nothing');
});

test('profile: all boxes empty keeps the saved address, old line or parts', async () => {
  const blank = await profile({ addressParts: { houseLot: '', street: '', subdivision: '', barangay: '', city: '', province: '', zip: '' }, address: '5 Old Road, Quezon City' });
  assert.equal(blank.status, 200, JSON.stringify(blank.body));
  assert.equal(users[0].address, '5 Old Road, Quezon City');
  assert.equal(users[0].addressParts, undefined);
});

test('profile: an older screen that sends only a changed line saves it and drops the parts that no longer match', async () => {
  users[0].addressParts = server.cleanParts(GOOD);
  users[0].address = server.buildAddress(GOOD);
  const res = await profile({ address: '9 New Street, Pasig' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(users[0].address, '9 New Street, Pasig');
  assert.equal(users[0].addressParts, undefined);
});
