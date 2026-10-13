// Which files in the file store no booking, report or user points to. Pure: the script reads the store and the database and passes
// plain values in, so this is tested without either. It only names files; nothing here deletes anything.
const { PROOF_PREFIX, safeProofName } = require('./fileAccess');

// The stored path fields, as paths into a booking or report document. Every place a /uploads/proofs/ path is kept.
const BOOKING_FILE_FIELDS = ['proofFile', 'balanceProofFile', 'discount.idFile', 'refund.proofFile', 'unitPurchaseProof'];
const REPORT_FILE_FIELDS = ['signedFormPhoto'];
const PROFILE_PREFIX = '/uploads/profile-images/';

const valueAt = (doc, path) => path.split('.').reduce((v, key) => (v == null ? undefined : v[key]), doc);

// The set of file names that the given documents refer to.
function referencedNames(docs, fields, prefix = PROOF_PREFIX) {
  const names = new Set();
  docs.forEach((doc) => fields.forEach((field) => {
    const stored = valueAt(doc, field);
    if (typeof stored === 'string' && stored.startsWith(prefix)) names.add(stored.slice(prefix.length));
  }));
  return names;
}

// Files on disk that nothing refers to, sorted. A name that is not a plain file name is left out (it is not ours to judge).
function findOrphans({ filesOnDisk, bookings, reports, users = [] }) {
  const used = new Set([
    ...referencedNames(bookings, BOOKING_FILE_FIELDS),
    ...referencedNames(reports, REPORT_FILE_FIELDS),
    ...referencedNames(users, ['profileImage'], PROFILE_PREFIX),
  ]);
  return filesOnDisk.filter((name) => safeProofName(name) && !used.has(name)).sort();
}

module.exports = { findOrphans, referencedNames, BOOKING_FILE_FIELDS, REPORT_FILE_FIELDS };
