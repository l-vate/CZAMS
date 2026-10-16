// Stored records keep a proof file as a path such as /uploads/proofs/<name>. Those files are no longer
// served as plain static files: they are opened through /api/files/proofs after a check of who is asking.
// This maps a stored path to the file name the new route needs, without rewriting any stored data.
const PROOF_PREFIX = '/uploads/proofs/';

// The file name for a stored proof path, or null if the value is not one (an external http link, a
// profile photo path, an empty value). A name with a slash or dot-dot is never accepted.
export function proofNameOf(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PROOF_PREFIX)) return null;
  const name = stored.slice(PROOF_PREFIX.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) return null;
  return name;
}

// True when the path points at a PDF (to show a link instead of an image preview).
export const isPdfPath = (stored) => typeof stored === 'string' && /\.pdf$/i.test(stored);
