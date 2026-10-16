// What a technician needs to know about a back job visit (a free repair visit made after a customer's warranty
// claim): which job it follows, when that was done and by whom, and what the original report said. Read only,
// and only whitelisted fields: nothing about the customer, money, proofs or the admin's notes.
const { getAssignments } = require('./assignments');

const pick = (source, keys) => {
  const out = {};
  keys.forEach((key) => {
    if (source && source[key] !== undefined) out[key] = source[key];
  });
  return out;
};

// `bookings` is the technician's jobs. Returns a Map from a back job visit's bookingId to
//   { backJobId, original: { bookingId, date, time, technicians: [{ name, role }] },
//     originalReport: { workSummary, issueResolution, submittedAt, preExistingIssue } | null }
// A booking that is not a back job has no entry. `BackJob`, `Booking`, `Report` and `User` are the Mongoose models.
async function loadBackJobContexts(bookings, { BackJob, Booking, Report, User }) {
  const visits = (bookings || []).filter((b) => b && b.isBackJob && b.backJobId);
  const contexts = new Map();
  if (visits.length === 0) return contexts;

  const claims = await BackJob.find({ backJobId: { $in: visits.map((b) => b.backJobId) } }).select('backJobId originalBookingId');
  const originalIds = [...new Set(claims.map((c) => c.originalBookingId).filter(Boolean))];
  if (originalIds.length === 0) return contexts;

  const [originals, reports] = await Promise.all([
    Booking.find({ bookingId: { $in: originalIds } }).select('bookingId date time technician assignments'),
    Report.find({ bookingId: { $in: originalIds } }).select('bookingId workSummary issueResolution submittedAt preExistingIssue'),
  ]);

  const userIds = [...new Set(originals.flatMap((o) => getAssignments(o).flatMap((a) => [a.lead, a.helper])).filter(Boolean))];
  const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select('name') : [];
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]));

  const originalById = new Map(originals.map((o) => [o.bookingId, o]));
  const reportById = new Map(reports.map((r) => [r.bookingId, r]));
  const claimByBackJob = new Map(claims.map((c) => [c.backJobId, c]));

  visits.forEach((visit) => {
    const claim = claimByBackJob.get(visit.backJobId);
    const original = claim && originalById.get(claim.originalBookingId);
    if (!claim) return;
    const technicians = original
      ? getAssignments(original).flatMap((a) => [
        { name: nameOf.get(a.lead) || 'Technician', role: 'Lead' },
        ...(a.helper ? [{ name: nameOf.get(a.helper) || 'Technician', role: 'Helper' }] : []),
      ])
      : [];
    const report = reportById.get(claim.originalBookingId);
    contexts.set(visit.bookingId, {
      backJobId: visit.backJobId,
      original: { bookingId: claim.originalBookingId, date: original?.date, time: original?.time, technicians },
      originalReport: report ? pick(report, ['workSummary', 'issueResolution', 'submittedAt', 'preExistingIssue']) : null,
    });
  });
  return contexts;
}

module.exports = { loadBackJobContexts };
