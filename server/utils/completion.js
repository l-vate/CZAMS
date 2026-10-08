// When was a Completed booking completed? Every consumer (warranty, back-job coverage, the
// service reminder job, the Return customer classification) asks this one helper, so they
// all agree even for old Completed bookings whose completedAt was never filled in.
//
// Fallback order: the booking's completedAt, the creation time of its report in the Report
// collection, then the booking's updatedAt.

const reportDateOf = (booking) => booking?.$locals?.reportCreatedAt ?? booking?.reportCreatedAt ?? null;

function effectiveCompletedAt(booking) {
  if (!booking) return null;
  return booking.completedAt || reportDateOf(booking) || booking.updatedAt || null;
}

const needsReportDate = (b) => b && b.status === 'Completed' && !b.completedAt;

// Looks up the report time for every Completed booking in `bookings` that has no completedAt,
// and remembers it on the booking so effectiveCompletedAt can use it without a query.
async function attachReportDates(bookings) {
  const missing = (bookings || []).filter(needsReportDate);
  if (missing.length === 0) return;
  const Report = require('../models/Report'); // required here, not at the top, so models/Booking can load this file
  const reports = await Report.find({ bookingId: { $in: missing.map((b) => b.bookingId) } }).select('bookingId createdAt').lean();
  const earliest = new Map();
  for (const r of reports) {
    const seen = earliest.get(r.bookingId);
    if (!seen || r.createdAt < seen) earliest.set(r.bookingId, r.createdAt);
  }
  for (const b of missing) {
    const at = earliest.get(b.bookingId);
    if (!at) continue;
    if (b.$locals) b.$locals.reportCreatedAt = at; else b.reportCreatedAt = at; // plain objects (lean)
  }
}

// Completed bookings matching `filter` whose effective completion date is on or after `since`.
// Includes the ones with no completedAt, which a plain `completedAt: { $gte }` query would miss.
async function findCompletedSince(Booking, filter, since) {
  const candidates = await Booking.find({
    ...filter,
    status: 'Completed',
    $or: [{ completedAt: { $gte: since } }, { completedAt: null }],
  });
  await attachReportDates(candidates);
  return candidates.filter((b) => effectiveCompletedAt(b) >= since);
}

module.exports = { effectiveCompletedAt, attachReportDates, findCompletedSince };
