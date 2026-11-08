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

// The text the check reads. A booking with structured parts (E33) is checked on its City part only: the line now ends with the province, and a
// province such as "Metro Manila" would otherwise let any address pass on the word "manila". A city typed under Other goes through the same keywords.
// A booking without parts (older data) is checked on its whole line, as before. src/utils/serviceArea.js does the same for the Quezon City notice.
function textToCheck(address, parts) {
  const city = parts && typeof parts === 'object' && typeof parts.city === 'string' ? parts.city.trim() : '';
  return (city || address || '').toLowerCase();
}

function isWithinServiceArea(address, parts) {
  const normalized = textToCheck(address, parts);
  return SERVICE_AREA_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

const QUEZON_CITY_KEYWORDS = ['quezon city', 'qc'];

function isWithinQuezonCity(address, parts) {
  const normalized = textToCheck(address, parts);
  return QUEZON_CITY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

module.exports = { SERVICE_AREA_KEYWORDS, isWithinServiceArea, isWithinQuezonCity };
