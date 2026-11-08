// Frontend side of the service area. The matching keywords and the real check live on the server
// (server/utils/serviceArea.js, run at booking creation); this file only holds what the
// screens display and the Quezon City test behind the distance charge warning in Step3.

// Customer-facing display list of the confirmed service areas.
export const SERVICE_AREA_DISPLAY_NAMES = [
  'Quezon City', 'Pasig', 'Manila', 'Cavite', 'Alabang', 'GMA (General Mariano Alvarez)', 'Carmona',
];

// Quezon City is CZA's home base: addresses outside it may incur a distance-based
// transportation charge.
const QUEZON_CITY_KEYWORDS = ['quezon city', 'qc'];

// With structured parts (E33) only the City part is read; without them (older data) the whole line, as before. server/utils/serviceArea.js has the same rule.
export function isWithinQuezonCity(address, parts) {
  const city = parts && typeof parts === 'object' && typeof parts.city === 'string' ? parts.city.trim() : '';
  const normalized = (city || address || '').toLowerCase();
  return QUEZON_CITY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
