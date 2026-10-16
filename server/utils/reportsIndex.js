// The state of the unique index on reports.bookingId, and what it takes to put it right. Pure apart from the collection it is given, so the
// script (scripts/fixReportsIndex.js) and the tests share it. A plain bookingId index of the same name stops the unique one from being built;
// duplicates in the data stop it too. The fix only ever drops the plain bookingId index, and only when no booking has two reports.
const isBookingIdKey = (index) => index && index.key && Object.keys(index.key).length === 1 && index.key.bookingId === 1;

// What the collection looks like now: { plain: the old index or null, unique: the unique one or null, duplicates: [...] }.
async function inspect(collection) {
  const indexes = await collection.indexes();
  const onBooking = indexes.filter(isBookingIdKey);
  const duplicates = await collection.aggregate([
    { $group: { _id: '$bookingId', count: { $sum: 1 }, reportIds: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  return {
    plain: onBooking.find((i) => i.unique !== true) || null,
    unique: onBooking.find((i) => i.unique === true) || null,
    duplicates,
  };
}

// One of: 'ok' (already unique), 'build' (no bookingId index: build the unique one), 'replace' (drop the plain one, build the unique one),
// 'blocked' (duplicates exist: nothing is changed, a person decides which report to keep).
function decide({ plain, unique, duplicates }) {
  if (duplicates.length > 0) return 'blocked';
  if (unique) return 'ok';
  return plain ? 'replace' : 'build';
}

const EXPLAIN = Object.freeze({
  ok: 'The unique bookingId index is already in place. Nothing to do.',
  build: 'There is no bookingId index. It would build the unique one.',
  replace: 'A plain bookingId index is in the way. It would drop that one index and build the unique one.',
  blocked: 'Some bookings have more than one report, so the unique index cannot be built. Nothing would be changed: keep one report per booking by hand, then run this again.',
});

// Does what decide() says. Returns the decision and what was done. Refuses to change anything when duplicates exist.
async function applyFix(collection, state) {
  const decision = decide(state);
  const done = [];
  if (decision === 'blocked' || decision === 'ok') return { decision, done };
  if (decision === 'replace') {
    await collection.dropIndex(state.plain.name);
    done.push(`dropped the plain index ${state.plain.name}`);
  }
  await collection.createIndex({ bookingId: 1 }, { unique: true });
  done.push('built the unique bookingId index');
  return { decision, done };
}

module.exports = { inspect, decide, applyFix, EXPLAIN };
