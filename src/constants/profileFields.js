// Limits and suggestions for the optional profile fields. The server enforces the same limits.
export const POSITION_MAX = 40;
export const COMPANY_NAME_MAX = 80;
export const REPRESENTATIVE_NAME_MAX = 80;

// Suggested staff positions. Any other text up to the limit is allowed too.
export const POSITION_SUGGESTIONS = Object.freeze(['Technician', 'Secretary', 'Cashier']);
