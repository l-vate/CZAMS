// Who may open an uploaded proof, and the short-lived signed links that let an <img> or a new tab open
// one (an <img> tag cannot send a token). Everything here is pure or takes its dependencies as
// arguments, so it is tested without a database.
//
// A stored path looks like /uploads/proofs/<name>. The five booking fields below and the service report
// photo are the only places such a path is kept; a file's owner is the booking that references it.
const crypto = require('crypto');

const PROOF_PREFIX = '/uploads/proofs/';
const LINK_TTL_SECONDS = 300; // 5 minutes

// What kind of file a reference is. Technicians may open only SIGNED_FORM.
const FILE_KIND = Object.freeze({
  DOWN_PAYMENT: 'down_payment_proof',
  BALANCE: 'balance_proof',
  ID_PHOTO: 'discount_id',
  REFUND: 'refund_proof',
  PURCHASE: 'purchase_proof',
  SIGNED_FORM: 'signed_form',
});

// A file name from a web address, or null if it is anything but a plain file name. Rejects path
// separators, drive letters, dots that lead, percent signs left over from double encoding, and
// anything long or odd, so no input can point outside the proofs folder.
function safeProofName(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > 128) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(raw)) return null;
  if (raw.includes('..')) return null;
  return raw;
}

const storedPathFor = (name) => `${PROOF_PREFIX}${name}`;

// The content type and disposition for a file, decided from the extension on a whitelist. Only
// jpg, png, webp and pdf are shown inline; anything else (an old upload with another extension) is
// downloaded as opaque bytes and never rendered by the browser.
const INLINE_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
});

function servingRulesFor(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot).toLowerCase();
  const type = INLINE_TYPES[ext];
  return type
    ? { contentType: type, disposition: 'inline' }
    : { contentType: 'application/octet-stream', disposition: 'attachment' };
}

// ---- who may open it

// `references`: [{ kind, customer, memberIds }], one per booking that points at the file, where
// customer is the booking's customer id and memberIds is every technician on that booking.
//   admin: any file (even one nothing points at)
//   customer: a file referenced by one of their own bookings, of any kind
//   technician: only the signed form photo of a job they are on (lead or helper)
//   anyone else: no
function decideAccess({ role, userId, references }) {
  if (role === 'admin') return true;
  const refs = Array.isArray(references) ? references : [];
  if (role === 'customer') return refs.some((r) => r.customer === userId);
  if (role === 'staff') return refs.some((r) => r.kind === FILE_KIND.SIGNED_FORM && (r.memberIds || []).includes(userId));
  return false;
}

// Every booking that references this stored path, with the kind of reference.
// `Booking` and `Report` are the Mongoose models, passed in so tests can substitute them.
async function findReferences(storedPath, { Booking, Report, getMemberIds }) {
  const bookings = await Booking.find({
    $or: [
      { proofFile: storedPath },
      { balanceProofFile: storedPath },
      { 'discount.idFile': storedPath },
      { 'refund.proofFile': storedPath },
      { unitPurchaseProof: storedPath },
    ],
  }).select('bookingId customer technician assignments proofFile balanceProofFile discount refund unitPurchaseProof');

  const references = [];
  bookings.forEach((b) => {
    const base = { customer: String(b.customer), memberIds: getMemberIds(b), bookingId: b.bookingId };
    if (b.proofFile === storedPath) references.push({ ...base, kind: FILE_KIND.DOWN_PAYMENT });
    if (b.balanceProofFile === storedPath) references.push({ ...base, kind: FILE_KIND.BALANCE });
    if (b.discount && b.discount.idFile === storedPath) references.push({ ...base, kind: FILE_KIND.ID_PHOTO });
    if (b.refund && b.refund.proofFile === storedPath) references.push({ ...base, kind: FILE_KIND.REFUND });
    if (b.unitPurchaseProof === storedPath) references.push({ ...base, kind: FILE_KIND.PURCHASE });
  });

  const reports = await Report.find({ signedFormPhoto: storedPath }).select('bookingId');
  if (reports.length > 0) {
    const jobs = await Booking.find({ bookingId: { $in: reports.map((r) => r.bookingId) } })
      .select('bookingId customer technician assignments');
    jobs.forEach((b) => references.push({
      kind: FILE_KIND.SIGNED_FORM, customer: String(b.customer), memberIds: getMemberIds(b), bookingId: b.bookingId,
    }));
  }
  return references;
}

// ---- signed links

// The signing key is derived from the existing secret, never the secret itself, so a link signature
// cannot be turned into a login token. It is built on demand and never logged or returned.
function linkKey(secret = process.env.JWT_SECRET) {
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('czams:file-link:v1').digest();
}

function signatureFor({ name, userId, exp }, secret) {
  const key = linkKey(secret);
  if (!key) return null;
  return crypto.createHmac('sha256', key).update(`${name}\n${userId}\n${exp}`).digest('hex');
}

// { u, exp, sig } for a file and a user, valid for LINK_TTL_SECONDS from `now` (milliseconds).
function createLinkParts({ name, userId, now = Date.now(), secret }) {
  const exp = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const sig = signatureFor({ name, userId, exp }, secret);
  return sig ? { u: userId, exp, sig } : null;
}

// true only for an unexpired link made for exactly this file and this user.
function verifyLinkParts({ name, u, exp, sig, now = Date.now(), secret }) {
  if (typeof u !== 'string' || typeof sig !== 'string' || !/^\d{1,12}$/.test(String(exp))) return false;
  if (Number(exp) < Math.floor(now / 1000)) return false;
  const expected = signatureFor({ name, userId: u, exp: String(exp) }, secret);
  if (!expected || expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

module.exports = {
  PROOF_PREFIX, LINK_TTL_SECONDS, FILE_KIND,
  safeProofName, storedPathFor, servingRulesFor, decideAccess, findReferences,
  createLinkParts, verifyLinkParts,
};
