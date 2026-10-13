// Which files in the proofs folder no booking or report points to. Pure: the script reads the folder and the database and passes
// plain values in, so this is tested without either. It only names files; nothing here deletes anything.
const { PROOF_PREFIX, safeProofName } = require('./fileAccess');

// The stored path fields, as paths into a booking or report document. Every place a /uploads/proofs/ path is kept.
const BOOKING_FILE_FIELDS = ['proofFile', 'balanceProofFile', 'discount.idFile', 'refund.proofFile', 'unitPurchaseProof'];
const REPORT_FILE_FIELDS = ['signedFormPhoto'];

const valueAt = (doc, path) => path.split('.').reduce((v, key) => (v == null ? undefined : v[key]), doc);

// The set of file names that the given documents refer to.
function referencedNames(docs, fields) {
  const names = new Set();
  docs.forEach((doc) => fields.forEach((field) => {
    const stored = valueAt(doc, field);
    if (typeof stored === 'string' && stored.startsWith(PROOF_PREFIX)) names.add(stored.slice(PROOF_PREFIX.length));
  }));
  return names;
}

// Files on disk that nothing refers to, sorted. A name that is not a plain file name is left out (it is not ours to judge).
function findOrphans({ filesOnDisk, bookings, reports }) {
  const used = new Set([...referencedNames(bookings, BOOKING_FILE_FIELDS), ...referencedNames(reports, REPORT_FILE_FIELDS)]);
  return filesOnDisk.filter((name) => safeProofName(name) && !used.has(name)).sort();
}

module.exports = { findOrphans, referencedNames, BOOKING_FILE_FIELDS, REPORT_FILE_FIELDS };
