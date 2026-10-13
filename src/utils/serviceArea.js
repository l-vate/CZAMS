// Frontend mirror of server/utils/serviceArea.js — keep the two in sync. Used by
// Step3 (book_service.jsx) to warn the customer in real time; the server re-checks
// independently at booking creation (this is a UX convenience, not the enforcement
// point — a customer could still bypass client-side JS entirely).
export const SERVICE_AREA_KEYWORDS = [
  'quezon city', 'qc',
  'pasig',
  'manila',
  'cavite',
  'alabang',
  'general mariano alvarez', 'gma',
  'carmona',
];

export function isWithinServiceArea(address) {
  const normalized = (address || '').toLowerCase();
  return SERVICE_AREA_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

// Customer-facing display list — separate from the matching keywords above,
// which include short aliases (qc, gma) not fit for display.
export const SERVICE_AREA_DISPLAY_NAMES = [
  'Quezon City', 'Pasig', 'Manila', 'Cavite', 'Alabang', 'GMA (General Mariano Alvarez)', 'Carmona',
];
