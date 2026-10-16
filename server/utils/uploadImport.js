// Moves the files that are on this machine's disk (server/uploads) into the file store (GridFS). Everything here takes its inputs as
// plain values or small interfaces, so it is tested with the in-memory store and no database. The script (scripts/importUploadsToStore.js)
// reads the folders and the database and hands them in.
//
// Never deletes or changes a disk file. Safe to run again: a name that is already in the store is skipped. Never returns or prints file
// contents.
const { safeProofName, PROOF_PREFIX } = require('./fileAccess');
const { KINDS, contentTypeOfName } = require('../storage/fileStore');

const PROFILE_PREFIX = '/uploads/profile-images/';
const KNOWN_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

// Where a stored path is kept, and what kind of file that makes it. The booking id comes from the document that holds the path.
const BOOKING_FIELDS = [
  { path: ['proofFile'], kind: KINDS.PROOF },
  { path: ['balanceProofFile'], kind: KINDS.PROOF },
  { path: ['discount', 'idFile'], kind: KINDS.ID_PHOTO },
  { path: ['refund', 'proofFile'], kind: KINDS.REFUND_PROOF },
  { path: ['unitPurchaseProof'], kind: KINDS.PURCHASE_PROOF },
];

const valueAt = (doc, keys) => keys.reduce((v, key) => (v == null ? undefined : v[key]), doc);
const nameFrom = (stored, prefix) => (typeof stored === 'string' && stored.startsWith(prefix) ? stored.slice(prefix.length) : null);

// name -> { kind, bookingId } for every name some record points at.
function referenceMap({ bookings = [], reports = [], users = [] }) {
  const refs = new Map();
  const add = (name, info) => { if (name && !refs.has(name)) refs.set(name, info); };
  bookings.forEach((b) => BOOKING_FIELDS.forEach((f) => add(nameFrom(valueAt(b, f.path), PROOF_PREFIX), { kind: f.kind, bookingId: b.bookingId || null })));
  reports.forEach((r) => add(nameFrom(r.signedFormPhoto, PROOF_PREFIX), { kind: KINDS.SIGNED_FORM, bookingId: r.bookingId || null }));
  users.forEach((u) => add(nameFrom(u.profileImage, PROFILE_PREFIX), { kind: KINDS.PROFILE_IMAGE, bookingId: null }));
  return refs;
}

const extensionOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
};

// What would be done. `disk`: [{ name, folder ('proofs' or 'profile-images'), size }]. `inStore`: a Set of names already in the store.
function planImport({ disk, inStore, references }) {
  const plan = { total: disk.length, totalBytes: 0, alreadyInStore: [], invalidNames: [], unknownExtensions: [], unreferenced: [], toCopy: [] };
  disk.forEach((file) => {
    plan.totalBytes += file.size || 0;
    if (!safeProofName(file.name)) { plan.invalidNames.push(file.name); return; }
    if (inStore.has(file.name)) { plan.alreadyInStore.push(file.name); return; }
    const ref = references.get(file.name);
    const kind = file.folder === 'profile-images' ? KINDS.PROFILE_IMAGE : (ref ? ref.kind : KINDS.LEGACY);
    if (!KNOWN_EXTENSIONS.includes(extensionOf(file.name))) plan.unknownExtensions.push(file.name);
    if (!ref && file.folder !== 'profile-images') plan.unreferenced.push(file.name);
    plan.toCopy.push({ name: file.name, folder: file.folder, size: file.size, kind, bookingId: ref ? ref.bookingId : null });
  });
  plan.bytesToCopy = plan.toCopy.reduce((sum, f) => sum + (f.size || 0), 0);
  return plan;
}

// Copies plan.toCopy into the store. `readFile(file)` returns the bytes of a disk file. A name that appeared in the store since the plan
// was made is skipped, so running twice, or two runs at once, never overwrites. Returns counts only.
async function applyImport({ plan, store, readFile }) {
  const result = { copied: 0, skippedExisting: 0, failed: [] };
  for (const file of plan.toCopy) {
    try {
      if (await store.exists(file.name)) { result.skippedExisting += 1; continue; }
      const buffer = await readFile(file);
      await store.save({
        name: file.name,
        buffer,
        contentType: contentTypeOfName(file.name),
        metadata: { kind: file.kind, bookingId: file.bookingId },
      });
      result.copied += 1;
    } catch (err) {
      if (err && err.code === 'EEXIST') result.skippedExisting += 1;
      else result.failed.push({ name: file.name, reason: err.message });
    }
  }
  return result;
}

// The lines the script prints: counts and names, never contents. Long lists are cut after `limit` names.
function describePlan(plan, { limit = 20 } = {}) {
  const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
  const names = (list) => (list.length === 0 ? '' : `: ${list.slice(0, limit).join(', ')}${list.length > limit ? `, and ${list.length - limit} more` : ''}`);
  return [
    `Files on disk: ${plan.total} (${mb(plan.totalBytes)} MB)`,
    `Already in the store: ${plan.alreadyInStore.length}`,
    `To copy: ${plan.toCopy.length} (${mb(plan.bytesToCopy)} MB)`,
    `Unknown extension: ${plan.unknownExtensions.length}${names(plan.unknownExtensions)}`,
    `Referenced by no record (stored as legacy): ${plan.unreferenced.length}${names(plan.unreferenced)}`,
    `Not a valid file name (skipped): ${plan.invalidNames.length}${names(plan.invalidNames)}`,
  ];
}

module.exports = { referenceMap, planImport, applyImport, describePlan, PROFILE_PREFIX, KNOWN_EXTENSIONS };
