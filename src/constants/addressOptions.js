// The cities in the City or Municipality list: CZA's confirmed service areas (server/utils/serviceArea.js keeps the words the check
// looks for) plus Other, which opens a box for any other city. Province is a suggestion only: it is filled in when it is still empty
// and can always be typed over. There is no ZIP list on purpose: a ZIP code is typed and only checked for being 4 digits.
export const OTHER_CITY = 'Other';

export const SERVICE_CITIES = [
  { name: 'Quezon City', province: 'Metro Manila' },
  { name: 'Pasig City', province: 'Metro Manila' },
  { name: 'Manila', province: 'Metro Manila' },
  { name: 'Muntinlupa (Alabang)', province: 'Metro Manila' },
  { name: 'Carmona', province: 'Cavite' },
  { name: 'General Mariano Alvarez', province: 'Cavite' },
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
