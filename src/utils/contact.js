// A contact number the technician can call: digits plus the usual separators,
// 7 to 15 digits. Same rule as normalizeContactNumber in server/routes/bookingRoutes.js.
export function isValidContactNumber(value) {
  const v = String(value || '').trim();
  if (!/^\+?[0-9\s\-()]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

// The logged-in user's profile phone, used to prefill the booking contact number.
export function getAccountPhone() {
  try {
    const stored = localStorage.getItem('user');
    return stored ? (JSON.parse(stored).phone || '') : '';
  } catch {
    return '';
  }
}
