// Run with: npm test (inside server/). E33c: the service area is Quezon City and Manila only. A booking with structured address parts is in area only when its
// City part is one of them; the Province is never read. Anything else is flagged for the admin, who decides whether to add a fee, and the booking is never
// refused. A booking without parts (older data) is checked on its line, as before. The client and server copies agree.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = require('../utils/serviceArea');
const { buildAddress } = require('../utils/addressParts');
const harness = require('./helpers/createBooking');

const root = path.join(__dirname, '..', '..');
const loadClient = () => import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(root, 'src', 'utils', 'serviceArea.js'), 'utf8')).toString('base64')}`);

const parts = (city, province = 'Metro Manila') => ({ houseLot: 'Blk 5 Lot 12', street: 'Mabini St.', barangay: 'Holy Spirit', city, province, zip: '1127' });
const within = (p) => server.isWithinServiceArea(buildAddress(p), p);

test('Quezon City and Manila pass, and so do QC, Quezon and City of Manila in any case and spacing', () => {
  for (const city of ['Quezon City', 'quezon city', '  QUEZON   CITY ', 'QC', 'Q.C.', 'qc', 'Quezon', 'Manila', 'MANILA', 'City of Manila', 'city  of   manila', 'Manila City']) {
    assert.equal(within(parts(city)), true, city);
  }
});

test('every other place is flagged, and the Province is never read', () => {
  for (const city of ['Makati', 'Pasig City', 'Pasig', 'Muntinlupa (Alabang)', 'Alabang', 'Carmona', 'General Mariano Alvarez', 'GMA', 'Dasmariñas', 'Imus', 'Baguio City', 'Metro Manila', 'Quezon Avenue', 'Manila Bay Village']) {
    assert.equal(within(parts(city, 'Metro Manila')), false, city);
  }
  assert.equal(within(parts('Makati', 'Manila')), false, 'a province that says Manila does not help');
  assert.equal(within(parts('Quezon City', 'Benguet')), true, 'and a strange province does not hurt');
  assert.equal(within(parts('Makati', 'Quezon City')), false);
});

test('only the city is read: a listed word in the street, subdivision or barangay does not make the booking in area', () => {
  const p = { ...parts('Makati'), street: 'Manila Blvd.', subdivision: 'Quezon City Heights', barangay: 'Quezon' };
  assert.equal(within(p), false);
  assert.equal(server.isWithinQuezonCity(buildAddress(p), p), false);
});

test('an older booking with only a line is checked on the line, exactly as before', () => {
  const words = ['quezon city', 'qc', 'pasig', 'manila', 'cavite', 'alabang', 'general mariano alvarez', 'gma', 'carmona'];
  assert.deepEqual(server.SERVICE_AREA_KEYWORDS, words, 'the line keywords are unchanged');
  for (const line of ['12 Old Street, Brgy. Pinyahan, Quezon City', 'Makati', 'Somewhere, Metro Manila', 'Imus, Cavite', 'Alabang', '3 Old St, Pasig', '', undefined]) {
    const before = words.some((w) => String(line || '').toLowerCase().includes(w));
    for (const noParts of [undefined, null, {}, { city: '   ' }, 'text']) {
      assert.equal(server.isWithinServiceArea(line, noParts), before, `${line} with ${JSON.stringify(noParts)}`);
    }
  }
});

test('the Quezon City notice is decided by the city when there are parts, and by the line when there are none', () => {
  assert.equal(server.isWithinQuezonCity(buildAddress(parts('Quezon City')), parts('Quezon City')), true);
  assert.equal(server.isWithinQuezonCity('x', parts('QC')), true);
  assert.equal(server.isWithinQuezonCity('x', parts('Quezon')), true);
  assert.equal(server.isWithinQuezonCity('x', parts('Manila')), false, 'Manila is in area but is not the home base');
  assert.equal(server.isWithinQuezonCity('x', parts('Pasig City')), false);
  assert.equal(server.isWithinQuezonCity('3 Old St, Quezon City'), true);
  assert.equal(server.isWithinQuezonCity('3 Old St, Pasig'), false);
});

test('the client and server copies agree on the area, the notice and the keyword list', async () => {
  const client = await loadClient();
  assert.deepEqual(client.SERVICE_AREA_KEYWORDS, server.SERVICE_AREA_KEYWORDS);
  const cities = ['Quezon City', 'qc', 'Quezon', 'Manila', 'City of Manila', 'Makati', 'Pasig City', 'Muntinlupa (Alabang)', 'Carmona', 'General Mariano Alvarez', 'Dasmariñas', 'Other', '', '  '];
  const samples = [[undefined, undefined], ['', null], ['3 Old St, Quezon City', undefined], ['3 Old St, Pasig', {}], ['QC', { city: '  ' }], ['Imus, Cavite', undefined]];
  cities.forEach((city) => samples.push([buildAddress(parts(city)), parts(city)], ['Quezon City, x', parts(city)]));
  samples.forEach(([line, p]) => {
    assert.equal(client.isWithinServiceArea(line, p), server.isWithinServiceArea(line, p), `area ${JSON.stringify([line, p])}`);
    assert.equal(client.isWithinQuezonCity(line, p), server.isWithinQuezonCity(line, p), `notice ${JSON.stringify([line, p])}`);
  });
});

test('the City dropdown offers Quezon City, Manila and Other, every listed city is in area, and a province is suggested for each', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'constants', 'addressOptions.js'), 'utf8');
  const names = [...src.matchAll(/\{ name: '([^']+)', province: '([^']+)' \}/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(names, [['Quezon City', 'Metro Manila'], ['Manila', 'Metro Manila']]);
  names.forEach(([city]) => assert.equal(within(parts(city)), true, city));
  assert.match(src, /OTHER_CITY = 'Other'/);
  assert.doesNotMatch(src, /Pasig|Muntinlupa|Carmona|General Mariano/);
});

test('the texts that list the service area match: the chat answer and the admin and booking form notices', () => {
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
  const client = read('src', 'utils', 'serviceArea.js');
  assert.match(client, /SERVICE_AREA_DISPLAY_NAMES = \['Quezon City', 'Manila'\]/);
  const chat = read('src', 'pages', 'customer', 'chat.jsx');
  assert.match(chat, /choose Other/);
  assert.doesNotMatch(chat, /distance-based transportation charge/);
  assert.match(read('src', 'pages', 'customer', 'book_service.jsx'), /outside Quezon City, so our team may add a transportation or distance fee/);
  assert.match(read('src', 'components', 'admin_service_details_modal.jsx'), /outside CZA's service areas \(Quezon City and Manila\)/);
});

const reset = () => harness.reset({
  users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }],
  services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
});

test('a booking is never refused: Quezon City and Manila are not flagged, Makati, Pasig and Dasmariñas are flagged for the admin', async () => {
  await harness.install();
  try {
    for (const [city, expected] of [['Quezon City', true], ['Manila', true], ['Makati', false], ['Pasig City', false], ['Dasmariñas', false]]) {
      reset();
      const res = await harness.post({ addressParts: parts(city) });
      assert.equal(res.status, 201, `${city}: ${JSON.stringify(res.body)}`);
      assert.equal(harness.state.bookings[0].serviceAreaCheck.withinArea, expected, city);
    }
  } finally {
    harness.close();
  }
});
