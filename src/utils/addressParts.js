// A street address as separate parts, and the one line built from them. The line (Booking.address, User.address) is what everything
// else reads (invoice, receipt, emails, search, the service area check); the parts (addressParts) sit next to it.
// server/utils/addressParts.js is the same code for the server: a test keeps the two equal. Pure, so it is tested on its own.
import limits from '../../server/constants/inputLimits.json';

const ADDRESS_LINE_MAX = limits.address;
const ZIP_PATTERN = /^\d{4}$/;

// part name -> [label for messages, inputLimits.json key]. Order is the order of the form.
const PARTS = [
  ['houseLot', 'House or Block and Lot', 'addressHouseLot', true],
  ['street', 'Street', 'addressStreet', true],
  ['subdivision', 'Subdivision or Building', 'addressSubdivision', false],
  ['barangay', 'Barangay', 'addressBarangay', true],
  ['city', 'City or Municipality', 'addressCity', true],
  ['province', 'Province', 'addressProvince', true],
  ['zip', 'ZIP code', 'addressZip', true],
];
const PART_KEYS = PARTS.map((p) => p[0]);

// Text of one part: trimmed, runs of spaces made single. Anything that is not text is ''.
function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

// The parts as clean text, only the known names (anything else sent is dropped).
function cleanParts(input) {
  const source = input && typeof input === 'object' ? input : {};
  const parts = {};
  PART_KEYS.forEach((key) => { parts[key] = cleanText(source[key]); });
  return parts;
}

// "Brgy. X": a name already typed with Brgy or Barangay in front is not prefixed twice.
function barangayText(name) {
  const bare = name.replace(/^(brgy|barangay)\.?\s+/i, '').trim();
  return bare ? `Brgy. ${bare}` : '';
}

// The built line: House or Block and Lot, Street, Subdivision or Building (if any), Brgy. Barangay, City, Province ZIP.
// The last two comma parts are "City, Province ZIP" (the emails show those as the area).
function buildAddress(input) {
  const p = cleanParts(input);
  const tail = [p.province, p.zip].filter(Boolean).join(' ');
  return [p.houseLot, p.street, p.subdivision, barangayText(p.barangay), p.city, tail].filter(Boolean).join(', ');
}

// True when no part has anything in it.
function isBlankParts(input) {
  const p = cleanParts(input);
  return PART_KEYS.every((key) => !p[key]);
}

// null when the parts are acceptable; otherwise a message for the first problem. Missing required part, too long, ZIP not 4 digits,
// or a built line over the 300 character cap.
function addressPartsProblem(input) {
  const p = cleanParts(input);
  for (const [key, label, limitKey, required] of PARTS) {
    if (required && !p[key]) return `${label} is required.`;
    if (key === 'zip') continue;
    if (p[key].length > limits[limitKey]) return `${label} must be ${limits[limitKey]} characters or fewer.`;
  }
  if (!ZIP_PATTERN.test(p.zip)) return 'ZIP code must be exactly 4 digits.';
  if (buildAddress(p).length > ADDRESS_LINE_MAX) return `The whole address must be ${ADDRESS_LINE_MAX} characters or fewer. Shorten one of the parts.`;
  return null;
}

// Parts sent as an object or as JSON text (a form upload sends text). null when it is neither.
function readParts(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export { PART_KEYS, ZIP_PATTERN, cleanParts, buildAddress, isBlankParts, addressPartsProblem, readParts };
