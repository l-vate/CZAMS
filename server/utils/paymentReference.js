// Payment reference numbers (the GCash or bank transfer reference) kept next to the proof file.
const { REFERENCE_REQUIRED_MODES } = require('../constants/paymentModes');
const { invalid } = require('./validation');

const REFERENCE_MIN = 4;
const REFERENCE_MAX = 30;
const REFERENCE_PATTERN = /^[A-Za-z0-9-]+$/;

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

function modeNeedsReference(mode) {
  return REFERENCE_REQUIRED_MODES.some((m) => sameName(m, mode));
}

// Trimmed and upper-cased, so the same reference typed two ways is recognised as the same.
function normalizeReference(raw) {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

// null when the text is an acceptable reference, otherwise { status, message }.
function referenceFormatProblem(reference) {
  if (reference.length < REFERENCE_MIN || reference.length > REFERENCE_MAX || !REFERENCE_PATTERN.test(reference)) {
    return invalid(`The reference number must be ${REFERENCE_MIN} to ${REFERENCE_MAX} characters: letters, digits and dashes only.`);
  }
  return null;
}

// Decides one payment submission. `strict` is true for a customer paying (proof and reference are
// both required for GCash and Bank Transfer) and false for an admin walk-in (reference optional).
// Returns { problem, reference }: problem is null or { status, message }; reference is the
// normalised text to store, or undefined when none was given.
function readPaymentSubmission({ mode, reference, hasProof, strict }) {
  const ref = normalizeReference(reference);

  if (ref) {
    const formatProblem = referenceFormatProblem(ref);
    if (formatProblem) return { problem: formatProblem };
  }
  if (strict && modeNeedsReference(mode)) {
    if (!hasProof) return { problem: invalid(`Upload the proof of payment for your ${mode} payment.`) };
    if (!ref) return { problem: invalid(`Enter the reference number of your ${mode} payment.`) };
  }
  return { problem: null, reference: ref || undefined };
}

// Other bookings that carry the same reference number (down payment or balance) as this one.
// A warning for the admin only, never a block. `Booking` is passed in to keep this file model-free.
async function findSameReference(Booking, booking) {
  const refs = [booking.referenceNumber, booking.balanceReferenceNumber].filter(Boolean);
  if (refs.length === 0) return [];
  const others = await Booking.find({
    bookingId: { $ne: booking.bookingId },
    $or: [{ referenceNumber: { $in: refs } }, { balanceReferenceNumber: { $in: refs } }],
  }).select('bookingId referenceNumber balanceReferenceNumber').lean();
  return others.map((o) => ({
    bookingId: o.bookingId,
    reference: refs.find((r) => r === o.referenceNumber || r === o.balanceReferenceNumber),
  }));
}

module.exports = {
  REFERENCE_MIN, REFERENCE_MAX, modeNeedsReference, normalizeReference, referenceFormatProblem,
  readPaymentSubmission, findSameReference,
};
