// Booking rules that the booking form and the server must agree on, kept in ONE place. The form imports this file;
// the server loads it with import() (server/utils/sharedRules.js). Plain functions and constants only: no framework,
// no database, no browser or Node specifics.

// Aircon unit types a booking can list, as stored on each unit entry.
export const UNIT_TYPE = Object.freeze({
  WINDOW: 'Window Type',
  SPLIT: 'Split Type',
  FLOOR_MOUNTED: 'Floor Mounted',
  CASSETTE: 'Cassette Type',
  PORTABLE: 'Portable',
});

export const UNIT_TYPES = Object.freeze(Object.values(UNIT_TYPE));

// The most units of one type on one booking line. One number, used by the form and checked by the server.
export const MAX_UNIT_QUANTITY = 20;

// Three-Tier Cleaning Structure. The tier is decided by two answers, never chosen directly:
//   the unit is leaking                        -> pull-down deep cleaning (the dearest tier)
//   not cleaned for six months or more         -> deep cleaning (the middle tier)
//   otherwise                                  -> regular cleaning (the cheapest tier)
// `cleaningServices` are the Cleaning-type services; they are ordered by price rather than by name, so renaming a
// tier in Manage Services changes nothing. Returns the service for the answers, or null when there is none.
export function resolveCleaningTier(cleaningServices, lastCleanedOver6MonthsAgo, isActivelyLeaking) {
  const tiers = [...cleaningServices].sort((a, b) => a.price - b.price);
  if (tiers.length === 0) return null;
  if (isActivelyLeaking) return tiers[tiers.length - 1];
  if (lastCleanedOver6MonthsAgo) return tiers[1] || tiers[0];
  return tiers[0];
}
