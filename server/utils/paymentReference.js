// Payment reference numbers (the GCash or bank transfer reference) kept next to the proof file.
const { PAYMENT_MODE, REFERENCE_REQUIRED_MODES } = require('../constants/paymentModes');
// GCASH_REFERENCE_DIGITS lives in constants/paymentReference.json, which the payment form reads too, so it changes in one place.
const { GCASH_REFERENCE_DIGITS } = require('../constants/paymentReference.json');
const { invalid } = require('./validation');

const REFERENCE_MIN = 4;
const REFERENCE_MAX = 30;
const REFERENCE_PATTERN = /^[A-Za-z0-9-]+$/;

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const isGcash = (mode) => sameName(PAYMENT_MODE.GCASH, mode);

function modeNeedsReference(mode) {
  return REFERENCE_REQUIRED_MODES.some((m) => sameName(m, mode));
}

// Trimmed and upper-cased, so the same reference typed two ways is recognised as the same.
function normalizeReference(raw) {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

// A GCash reference as typed or pasted from the receipt: spaces and dashes taken out (the receipt groups the digits), so 13 digits with or
// without spaces are the same reference.
function normalizeGcashReference(raw) {
  return typeof raw === 'string' ? raw.replace(/[\s-]/g, '') : '';
}

// null when the (normalised) text is a GCash reference: exactly GCASH_REFERENCE_DIGITS digits and nothing else.
function gcashFormatProblem(reference) {
  const ok = reference.length === GCASH_REFERENCE_DIGITS && /^\d+$/.test(reference);
  return ok ? null : invalid(`A GCash reference number has ${GCASH_REFERENCE_DIGITS} digits. Check your receipt.`);
}

// null when the text is an acceptable reference, otherwise { status, message }.
function referenceFormatProblem(reference) {
  if (reference.length < REFERENCE_MIN || reference.length > REFERENCE_MAX || !REFERENCE_PATTERN.test(reference)) {
    return invalid(`The reference number must be ${REFERENCE_MIN} to ${REFERENCE_MAX} characters: letters, digits and dashes only.`);
  }
  return null;
}

// Decides one payment submission. `strict` is true for a customer paying (proof and reference are
// both required for GCash and Bank Transfer, and a GCash reference must have exactly GCASH_REFERENCE_DIGITS digits; a Bank Transfer
// reference stays flexible because banks differ) and false for an admin walk-in (reference optional, the general format only).
// Returns { problem, reference }: problem is null or { status, message }; reference is the
// normalised text to store, or undefined when none was given.
function readPaymentSubmission({ mode, reference, hasProof, strict }) {
  const gcash = strict && isGcash(mode);
  const ref = gcash ? normalizeGcashReference(reference) : normalizeReference(reference);

  if (ref) {
    const formatProblem = gcash ? gcashFormatProblem(ref) : referenceFormatProblem(ref);
    if (formatProblem) return { problem: formatProblem };
  }
  if (strict && modeNeedsReference(mode)) {
    if (!hasProof) return { problem: invalid(`Upload the proof of payment for your ${mode} payment.`) };
    if (!ref) return { problem: invalid(`Enter the reference number of your ${mode} payment.`) };
  }
  return { problem: null, reference: ref || undefined };
}

// Other payments that carry the same reference number with the same payment method (a down payment is matched against other down
// payments and balances of the same method, and so on). A warning for the admin only, never a block. `Booking` is passed in to keep
// this file model-free.
async function findSameReference(Booking, booking) {
  const mine = [
    { reference: booking.referenceNumber, mode: booking.paymentMode },
    { reference: booking.balanceReferenceNumber, mode: booking.paymentMode2 },
  ].filter((p) => p.reference);
  if (mine.length === 0) return [];
  const others = await Booking.find({
    bookingId: { $ne: booking.bookingId },
    $or: [{ referenceNumber: { $in: mine.map((p) => p.reference) } }, { balanceReferenceNumber: { $in: mine.map((p) => p.reference) } }],
  }).select('bookingId referenceNumber balanceReferenceNumber paymentMode paymentMode2').lean();
  const found = [];
  others.forEach((o) => {
    const theirs = [
      { reference: o.referenceNumber, mode: o.paymentMode },
      { reference: o.balanceReferenceNumber, mode: o.paymentMode2 },
    ];
    const match = mine.find((m) => theirs.some((t) => t.reference === m.reference && sameName(t.mode, m.mode)));
    if (match) found.push({ bookingId: o.bookingId, reference: match.reference, method: match.mode || null });
  });
  return found;
}

module.exports = {
  REFERENCE_MIN, REFERENCE_MAX, GCASH_REFERENCE_DIGITS, modeNeedsReference, normalizeReference, normalizeGcashReference, gcashFormatProblem, referenceFormatProblem,
  readPaymentSubmission, findSameReference,
};
