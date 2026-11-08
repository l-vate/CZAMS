// Frontend side of the service area (E33c). The service area is Quezon City and Manila only; anything else is flagged for the admin, who decides whether
// to add a fee, and a booking is never refused. The same rule as server/utils/serviceArea.js, and a test keeps the two equal: with structured address parts
// only the City part is read (Quezon City, QC, Quezon, Manila, City of Manila, in any case and spacing; the province is never read), and an older record
// with only a line is checked on the line against the keywords.

// Customer-facing display list of the confirmed service areas.
export const SERVICE_AREA_DISPLAY_NAMES = ['Quezon City', 'Manila'];

// The words the older, line only check looks for (the server's SERVICE_AREA_KEYWORDS).
export const SERVICE_AREA_KEYWORDS = [
  'quezon city', 'qc', 'pasig', 'manila', 'cavite', 'alabang', 'general mariano alvarez', 'gma', 'carmona',
];

const QUEZON_CITY_NAMES = new Set(['quezoncity', 'quezon', 'qc']);
const MANILA_NAMES = new Set(['manila', 'cityofmanila', 'manilacity']);
const compactName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cityOf = (parts) => (parts && typeof parts === 'object' && typeof parts.city === 'string' ? parts.city.trim() : '');

export function isWithinServiceArea(address, parts) {
  const city = cityOf(parts);
  if (city) return QUEZON_CITY_NAMES.has(compactName(city)) || MANILA_NAMES.has(compactName(city));
  const normalized = String(address || '').toLowerCase();
  return SERVICE_AREA_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

// Quezon City is CZA's home base: addresses outside it may get a distance or transportation fee, which the admin decides.
const QUEZON_CITY_KEYWORDS = ['quezon city', 'qc'];

export function isWithinQuezonCity(address, parts) {
  const city = cityOf(parts);
  if (city) return QUEZON_CITY_NAMES.has(compactName(city));
  const normalized = String(address || '').toLowerCase();
  return QUEZON_CITY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
