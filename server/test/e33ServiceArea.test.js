// Run with: npm test (inside server/). E33 follow-up: a booking with structured address parts is checked against the service area on its City part only,
// so a province such as "Metro Manila" cannot let a city outside the areas pass. A booking without parts (older data) is checked on its line, as before.
// The check only flags a booking for the admin; it never refuses one. The client and server copies of the Quezon City test agree.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const server = require('../utils/serviceArea');
const { buildAddress } = require('../utils/addressParts');
const harness = require('./helpers/createBooking');

const root = path.join(__dirname, '..', '..');
const loadClient = () => import(pathToFileURL(path.join(root, 'src', 'utils', 'serviceArea.js')).href);

const parts = (city, province = 'Metro Manila') => ({ houseLot: 'Blk 5 Lot 12', street: 'Mabini St.', barangay: 'Holy Spirit', city, province, zip: '1127' });
const within = (p) => server.isWithinServiceArea(buildAddress(p), p);

test('every listed city passes', () => {
  const listed = [['Quezon City', 'Metro Manila'], ['Pasig City', 'Metro Manila'], ['Manila', 'Metro Manila'], ['Muntinlupa (Alabang)', 'Metro Manila'], ['Carmona', 'Cavite'], ['General Mariano Alvarez', 'Cavite']];
  listed.forEach(([city, province]) => assert.equal(within(parts(city, province)), true, city));
});

test('Other with Makati and province Metro Manila is flagged, as a Makati address without the province was before the parts', () => {
  const p = parts('Makati', 'Metro Manila');
  assert.equal(within(p), false, 'the province no longer lets it pass on the word "manila"');
  assert.equal(server.isWithinServiceArea('Blk 5 Lot 12, Mabini St., Brgy. Holy Spirit, Makati'), false, 'the old line check gave the same answer');
  assert.equal(within(parts('Baguio City', 'Benguet')), false);
});

test('Other with a listed city name typed in passes, in any case and with spaces', () => {
  for (const city of ['Pasig', 'pasig city', '  QUEZON CITY ', 'Manila', 'Carmona', 'Alabang', 'General Mariano Alvarez', 'GMA']) {
    assert.equal(within(parts(city, 'Anything')), true, city);
  }
});

test('only the city is read: a listed word in the street, subdivision or province does not make the booking in area', () => {
  const p = { ...parts('Makati', 'Manila'), street: 'Pasig Blvd.', subdivision: 'Quezon City Heights' };
  assert.equal(within(p), false);
  assert.equal(server.isWithinQuezonCity(buildAddress(p), p), false);
});

test('an older booking with only a line is checked on the line, exactly as before', () => {
  for (const line of ['12 Old Street, Brgy. Pinyahan, Quezon City', 'Makati', 'Somewhere, Metro Manila', 'Imus, Cavite', 'Alabang', '', undefined]) {
    const before = SERVICE_AREA_WORDS.some((w) => String(line || '').toLowerCase().includes(w));
    assert.equal(server.isWithinServiceArea(line), before, String(line));
    assert.equal(server.isWithinServiceArea(line, undefined), before, `${line} with undefined parts`);
    assert.equal(server.isWithinServiceArea(line, null), before, `${line} with null parts`);
    assert.equal(server.isWithinServiceArea(line, {}), before, `${line} with empty parts`);
    assert.equal(server.isWithinServiceArea(line, { city: '   ' }), before, `${line} with a blank city`);
  }
});
const SERVICE_AREA_WORDS = ['quezon city', 'qc', 'pasig', 'manila', 'cavite', 'alabang', 'general mariano alvarez', 'gma', 'carmona'];

test('the Quezon City notice is decided by the city when there are parts, and by the line when there are none', () => {
  assert.equal(server.isWithinQuezonCity(buildAddress(parts('Quezon City')), parts('Quezon City')), true);
  assert.equal(server.isWithinQuezonCity(buildAddress(parts('Pasig City')), parts('Pasig City')), false);
  assert.equal(server.isWithinQuezonCity(buildAddress(parts('qc', 'Metro Manila')), parts('qc', 'Metro Manila')), true, 'Other typed as QC');
  assert.equal(server.isWithinQuezonCity('3 Old St, Quezon City'), true);
  assert.equal(server.isWithinQuezonCity('3 Old St, Pasig'), false);
});

test('the client and server copies of the Quezon City test agree on lines and on parts', async () => {
  const client = await loadClient();
  const samples = [
    [undefined, undefined], ['', null], ['3 Old St, Quezon City', undefined], ['3 Old St, Pasig', {}], ['QC', { city: '  ' }],
    [buildAddress(parts('Quezon City')), parts('Quezon City')], [buildAddress(parts('Pasig City')), parts('Pasig City')],
    [buildAddress(parts('Makati')), parts('Makati')], [buildAddress(parts('qc')), parts('qc')], ['Quezon City, x', parts('Makati')],
  ];
  samples.forEach(([line, p]) => assert.equal(client.isWithinQuezonCity(line, p), server.isWithinQuezonCity(line, p), JSON.stringify([line, p])));
});

test('a booking is still accepted either way: an in area city is not flagged, Makati is flagged for the admin', async () => {
  await harness.install();
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
    services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
  });
  try {
    const ok = await harness.post({ addressParts: parts('Pasig City') });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(harness.state.bookings[0].serviceAreaCheck.withinArea, true);
    harness.reset({
      users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
      services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
    });
    const flagged = await harness.post({ addressParts: parts('Makati', 'Metro Manila') });
    assert.equal(flagged.status, 201, JSON.stringify(flagged.body));
    assert.equal(harness.state.bookings[0].serviceAreaCheck.withinArea, false);
  } finally {
    harness.close();
  }
});
