// Aircon unit types a booking can list, as stored on each unit entry.
export const UNIT_TYPE = Object.freeze({
  WINDOW: 'Window Type',
  SPLIT: 'Split Type',
  FLOOR_MOUNTED: 'Floor Mounted',
  CASSETTE: 'Cassette Type',
  PORTABLE: 'Portable',
});

export const UNIT_TYPES = Object.freeze(Object.values(UNIT_TYPE));
