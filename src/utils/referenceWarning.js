// The warning under a payment reference when other bookings used the same number: ONE sentence naming them all (with a cap), not one
// warning per booking. The server returns one row per other booking ({ bookingId, method }); nothing about that changes.
export const SHOWN_BOOKINGS = 2;

const CHECK = 'Check that it is not the same payment submitted twice.';

// "A", "A and B", "A, B and C", then "A, B and 2 more" once there are more than three.
export function bookingList(ids) {
  if (ids.length <= 1) return ids.join('');
  if (ids.length <= SHOWN_BOOKINGS + 1) return `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
  const more = ids.length - SHOWN_BOOKINGS;
  return `${ids.slice(0, SHOWN_BOOKINGS).join(', ')} and ${more} more`;
}

// The warnings to show: one per payment method (nearly always exactly one), each listing every other booking once.
export function referenceWarnings(duplicates) {
  const byMethod = new Map();
  (Array.isArray(duplicates) ? duplicates : []).forEach((d) => {
    if (!d || !d.bookingId) return;
    const key = d.method || '';
    if (!byMethod.has(key)) byMethod.set(key, []);
    const ids = byMethod.get(key);
    if (!ids.includes(d.bookingId)) ids.push(d.bookingId);
  });
  return [...byMethod].map(([method, ids]) => ({
    key: method || 'reference',
    text: `This ${method ? `${method} ` : ''}reference number was already used on ${ids.length === 1 ? 'booking' : 'bookings'} ${bookingList(ids)}. ${CHECK}`,
  }));
}
