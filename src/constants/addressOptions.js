// The cities in the City or Municipality list: CZA's service areas, Quezon City and Manila (E33c), plus Other, which opens a box for any other city and
// is flagged for the admin (server/utils/serviceArea.js). Province is a suggestion only: it is filled in when it is still empty
// and can always be typed over. There is no ZIP list on purpose: a ZIP code is typed and only checked for being 4 digits.
export const OTHER_CITY = 'Other';

export const SERVICE_CITIES = [
  { name: 'Quezon City', province: 'Metro Manila' },
  { name: 'Manila', province: 'Metro Manila' },
];

export const SERVICE_CITY_NAMES = SERVICE_CITIES.map((c) => c.name);

export const EMPTY_ADDRESS_PARTS = Object.freeze({
  houseLot: '', street: '', subdivision: '', barangay: '', city: '', province: '', zip: '',
});

// The parts of a saved address for a form: every part as text, empty when the record has none (an older record).
export function partsForForm(parts) {
  const source = parts && typeof parts === 'object' ? parts : {};
  const result = { ...EMPTY_ADDRESS_PARTS };
  Object.keys(result).forEach((key) => { result[key] = typeof source[key] === 'string' ? source[key] : ''; });
  return result;
}
