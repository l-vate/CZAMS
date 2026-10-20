// Retention of the Senior/PWD ID photo. The photo is kept only so the owner can check it. ID_PHOTO_RETENTION_DAYS (constants/discount.js, 30)
// after the booking was completed or cancelled, or after the discount request was rejected, the stored file is deleted. The discount record
// stays (type, who verified, when, rate, amount, consent); only the file and its path go, and an audit line says it was done.
//
// A booking that is still active (Pending, Approved, In Progress) is never touched, whatever the discount says: its ID photo may still be
// needed. A rejected request on a booking that is still active therefore waits until the booking ends.
//
// runIdPhotoRetention() takes its dependencies as arguments, so it is tested without a database. In a dry run nothing is deleted or
// changed. It reports counts only: nothing here logs or returns a file name or a person.
const DAY_MS = 24 * 60 * 60 * 1000;
const FINISHED = ['Completed', 'Cancelled'];

const nameOf = (storedPath) => String(storedPath || '').split('/').pop();

// 'finished' or 'rejected' when the photo on this booking is due to be deleted at `now`, otherwise null.
function dueReason(booking, now, retentionDays) {
  if (!booking || !booking.discount || !booking.discount.idFile) return null;
  if (!FINISHED.includes(booking.status)) return null; // active: never
  const limit = retentionDays * DAY_MS;
  const endedAt = booking.status === 'Cancelled'
    ? (booking.cancelledAt || booking.updatedAt)
    : (booking.completedAt || booking.updatedAt);
  if (endedAt && now - new Date(endedAt).getTime() >= limit) return 'finished';
  const d = booking.discount;
  if (d.status === 'Rejected' && d.reviewedAt && now - new Date(d.reviewedAt).getTime() >= limit) return 'rejected';
  return null;
}

// deps: { Booking, store, audit } (audit is recordAudit). Returns { checked, due, deleted, dryRun }.
async function runIdPhotoRetention({ Booking, store, audit, now = new Date(), retentionDays, dryRun = false }) {
  const candidates = await Booking.find({ 'discount.idFile': { $exists: true, $nin: [null, ''] } })
    .select('bookingId status completedAt cancelledAt updatedAt discount');
  let due = 0;
  let deleted = 0;
  for (const booking of candidates) {
    const reason = dueReason(booking, now.getTime(), retentionDays);
    if (!reason) continue;
    due += 1;
    if (dryRun) continue;
    const storedName = nameOf(booking.discount.idFile);
    const removedAt = new Date(now);
    // one conditional update: only a booking that is still finished and still holds this photo is changed
    const result = await Booking.updateOne(
      { _id: booking._id, status: { $in: FINISHED }, 'discount.idFile': booking.discount.idFile },
      { $set: { 'discount.idFileDeletedAt': removedAt }, $unset: { 'discount.idFile': '' } }
    );
    if (!(result && (result.modifiedCount === undefined || result.modifiedCount > 0))) continue;
    try { await store.remove(storedName); } catch { /* the record is already cleared; a leftover file is found by the orphan check */ }
    deleted += 1;
    if (audit) {
      await audit({
        actor: { id: 'system', name: 'Retention job', role: 'system' },
        action: 'discount.id_photo_deleted',
        entityType: 'Booking',
        entityId: booking.bookingId,
        summary: 'Deleted the Senior/PWD ID photo after the retention period',
        meta: { retentionDays, reason },
      });
    }
  }
  return { checked: candidates.length, due, deleted, dryRun };
}

module.exports = { runIdPhotoRetention, dueReason, nameOf };
