// Display helpers for shop closure dates (YYYY-MM-DD keys).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "October 20, 2026"
export function formatClosureDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// The warning shown to an admin about bookings already on a date that is being closed.
export function affectedBookingsNote(count) {
  if (!count) return '';
  const noun = count === 1 ? 'booking is' : 'bookings are';
  return `${count} Pending or Approved ${noun} already on this date. Closing it does not cancel or move them.`;
}
