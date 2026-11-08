// Explicit Service Area Boundary - CZA's confirmed coverage. Kept as a named list
// (not a real zone/geocoding system - there's no price-by-zone table to build one
// against) so it's a one-line edit if the area changes. Matched as a case-
// insensitive substring against the free-text booking address: imprecise by
// nature (a real address might name a barangay/subdivision with no city at all),
// which is exactly why a miss flags for admin review rather than hard-blocking
// the booking outright - see serviceAreaCheck on the Booking model.
const SERVICE_AREA_KEYWORDS = [
  'quezon city', 'qc',
  'pasig',
  'manila',
  'cavite',
  'alabang',
  'general mariano alvarez', 'gma',
  'carmona',
];

// E33c: the service area is Quezon City and Manila only. A booking with structured parts (E33) is in area only when its City part is Quezon City
// ("QC" and "Quezon" too) or Manila ("City of Manila" too), in any case and spacing; the Province is never read, so "Metro Manila" cannot let another city
// pass. Anything else is flagged for the admin, who decides whether to add a fee: the check never refuses a booking. A booking without parts (older data)
// is checked on its whole line against the keyword list above, exactly as before. src/utils/serviceArea.js has the same rule for the screens, and a test
// keeps the two equal.
const QUEZON_CITY_NAMES = new Set(['quezoncity', 'quezon', 'qc']);
const MANILA_NAMES = new Set(['manila', 'cityofmanila', 'manilacity']);

// The city as one run of letters and digits: case, spaces and punctuation ("Q.C.", "City of  Manila") do not matter.
const compactName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The City part of structured parts, or '' when there are none (an older record).
function cityOf(parts) {
  return parts && typeof parts === 'object' && typeof parts.city === 'string' ? parts.city.trim() : '';
}

function isWithinServiceArea(address, parts) {
  const city = cityOf(parts);
  if (city) return QUEZON_CITY_NAMES.has(compactName(city)) || MANILA_NAMES.has(compactName(city));
  const normalized = String(address || '').toLowerCase();
  return SERVICE_AREA_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

// Quezon City is the home base: a booking anywhere else may get a distance or transportation fee (the admin decides). The same rule, on the city.
const QUEZON_CITY_KEYWORDS = ['quezon city', 'qc'];

function isWithinQuezonCity(address, parts) {
  const city = cityOf(parts);
  if (city) return QUEZON_CITY_NAMES.has(compactName(city));
  const normalized = String(address || '').toLowerCase();
  return QUEZON_CITY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

module.exports = { SERVICE_AREA_KEYWORDS, isWithinServiceArea, isWithinQuezonCity };
