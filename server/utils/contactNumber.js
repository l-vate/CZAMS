// A phone number someone can actually call: digits plus the usual separators, 7 to 15 digits. Returns the trimmed value,
// or null if it is not one. Used for the booking's contact number, registration and the profile.
function normalizeContactNumber(raw) {
  const value = String(raw || '').trim();
  if (!/^\+?[0-9\s\-()]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? value : null;
}

module.exports = { normalizeContactNumber };
