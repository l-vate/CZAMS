// Payment reference numbers (the GCash or bank transfer reference) that go with a proof file.
// The server enforces the same rules (server/utils/paymentReference.js).
import { PAYMENT_MODE, REFERENCE_REQUIRED_MODES } from '../constants/paymentModes';
// GCASH_REFERENCE_DIGITS lives in server/constants/paymentReference.json, which the server reads too, so it changes in one place.
import referenceConstants from '../../server/constants/paymentReference.json';

export const { GCASH_REFERENCE_DIGITS } = referenceConstants;
export const REFERENCE_MIN = 4;
export const REFERENCE_MAX = 30;
const REFERENCE_PATTERN = /^[A-Za-z0-9-]+$/;

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// True for the modes that need a proof file and a reference number (GCash, Bank Transfer).
export function needsReference(mode) {
  return REFERENCE_REQUIRED_MODES.some((m) => sameName(m, mode));
}

export const isGcashMode = (mode) => sameName(PAYMENT_MODE.GCASH, mode);

// What is stored and sent. A GCash reference has its spaces and dashes taken out (the receipt groups the digits, and a pasted value keeps
// the spaces); any other reference is trimmed and upper-cased, so the same reference typed two ways reads the same.
export function normalizeReference(raw, mode) {
  const text = String(raw ?? '');
  return isGcashMode(mode) ? text.replace(/[\s-]/g, '') : text.trim().toUpperCase();
}

// '' when the text is an acceptable reference, otherwise the message to show.
export function referenceError(raw, mode) {
  const ref = normalizeReference(raw, mode);
  if (isGcashMode(mode)) {
    if (!ref) return 'Enter the reference number of your GCash payment.';
    if (!/^\d+$/.test(ref)) return `A GCash reference number has ${GCASH_REFERENCE_DIGITS} digits. Use numbers only.`;
    if (ref.length !== GCASH_REFERENCE_DIGITS) return `A GCash reference number has ${GCASH_REFERENCE_DIGITS} digits. You typed ${ref.length}. Check your receipt.`;
    return '';
  }
  if (!ref) return 'Enter the reference number of your payment.';
  if (ref.length < REFERENCE_MIN || ref.length > REFERENCE_MAX || !REFERENCE_PATTERN.test(ref)) {
    return `Use ${REFERENCE_MIN} to ${REFERENCE_MAX} characters: letters, digits and dashes only.`;
  }
  return '';
}

// The short hint under the reference box, by payment method.
export function referenceHint(mode) {
  return isGcashMode(mode)
    ? `The ${GCASH_REFERENCE_DIGITS} digit reference number on your GCash receipt.`
    : `${REFERENCE_MIN} to ${REFERENCE_MAX} letters, digits or dashes, as shown on your transfer receipt.`;
}

// An example for the empty box: a GCash reference is shown as the right number of digits.
export function referencePlaceholder(mode) {
  return isGcashMode(mode) ? `e.g. ${'1234567890123456789'.slice(0, GCASH_REFERENCE_DIGITS)}` : 'e.g. 1234567890';
}
