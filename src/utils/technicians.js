// Who counts as a field technician. Mirrors server/utils/technicians.js: an active staff account whose position is a
// field position (Technician, Lead Technician, Helper), or has no position at all (an account made before positions
// existed). Secretaries, cashiers and any other position are office staff, not technicians.
import { ROLE } from '../constants/roles.js';

export const FIELD_POSITIONS = Object.freeze(['Technician', 'Lead Technician', 'Helper']);
const KEYS = new Set(FIELD_POSITIONS.map((p) => p.toLowerCase()));

export const hasFieldPosition = (position) => {
  const key = String(position || '').trim().toLowerCase();
  return key === '' || KEYS.has(key);
};

export const isFieldTechnician = (user) => !!user && user.role === ROLE.STAFF && user.isActive !== false && hasFieldPosition(user.position);
