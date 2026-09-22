// Explicit Service Area Boundary — CZA's confirmed coverage. Kept as a named list
// (not a real zone/geocoding system — there's no price-by-zone table to build one
// against) so it's a one-line edit if the area changes. Matched as a case-
// insensitive substring against the free-text booking address: imprecise by
// nature (a real address might name a barangay/subdivision with no city at all),
// which is exactly why a miss flags for admin review rather than hard-blocking
// the booking outright — see serviceAreaCheck on the Booking model.
const SERVICE_AREA_KEYWORDS = [
  'quezon city', 'qc',
  'pasig',
  'manila',
  'cavite',
  'alabang',
  'general mariano alvarez', 'gma',
  'carmona',
];

function isWithinServiceArea(address) {
  const normalized = (address || '').toLowerCase();
  return SERVICE_AREA_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

module.exports = { SERVICE_AREA_KEYWORDS, isWithinServiceArea };
