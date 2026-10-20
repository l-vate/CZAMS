// What the booking history card should show. A failed request is an error, never "no history": the empty message is only for a successful
// answer that really has no bookings. An answer that is not the expected shape counts as a failure too. Plain function, so a test loads it
// on its own.
export function historyScreenState({ failed, history }) {
  if (failed) return 'error';
  if (!history) return 'loading';
  const shaped = history.counts && typeof history.counts.total === 'number' && Array.isArray(history.recent) && Array.isArray(history.feedback);
  if (!shaped) return 'error';
  return history.counts.total === 0 ? 'empty' : 'ready';
}
