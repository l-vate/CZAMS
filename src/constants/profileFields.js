// Limits and suggestions for the optional profile fields. The server enforces the same limits.
export const POSITION_MAX = 40;
export const COMPANY_NAME_MAX = 80;
export const REPRESENTATIVE_NAME_MAX = 80;

// Suggested staff positions. Any other text up to the limit is allowed too.
// Technician, Lead Technician and Helper are field positions: only these (or no position) can be put on a job.
export const POSITION_SUGGESTIONS = Object.freeze(['Technician', 'Lead Technician', 'Helper', 'Secretary', 'Cashier']);
