// Payment reference numbers (the GCash or bank transfer reference) that go with a proof file.
// The server enforces the same rules (server/utils/paymentReference.js).
import { REFERENCE_REQUIRED_MODES } from '../constants/paymentModes';

export const REFERENCE_MIN = 4;
export const REFERENCE_MAX = 30;
const REFERENCE_PATTERN = /^[A-Za-z0-9-]+$/;

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// True for the modes that need a proof file and a reference number (GCash, Bank Transfer).
export function needsReference(mode) {
  return REFERENCE_REQUIRED_MODES.some((m) => sameName(m, mode));
}

// Trimmed and upper-cased, so the same reference typed two ways reads the same.
export function normalizeReference(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

// '' when the text is an acceptable reference, otherwise the message to show.
export function referenceError(raw) {
  const ref = normalizeReference(raw);
  if (!ref) return 'Enter the reference number of your payment.';
  if (ref.length < REFERENCE_MIN || ref.length > REFERENCE_MAX || !REFERENCE_PATTERN.test(ref)) {
    return `Use ${REFERENCE_MIN} to ${REFERENCE_MAX} characters: letters, digits and dashes only.`;
  }
  return '';
}
