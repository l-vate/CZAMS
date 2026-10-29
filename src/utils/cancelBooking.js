// The admin's Cancel Booking dialog: the reasons to choose from and the request each one sends. Plain functions (no framework, so the tests load this
// file on its own). The refund rules are the server's and do not depend on the reason, except that "We cannot supply or serve" is the owner
// cancelling: the whole verified down payment goes back with no transportation fee, on any date.
export const CANCEL_CHOICES = Object.freeze([
  { key: 'customer', label: 'Customer request' },
  { key: 'owner', label: 'We cannot supply or serve' },
  { key: 'other', label: 'Other' },
]);

export const REASON_MIN = 3;
export const REASON_MAX = 200;

// What the dialog says in plain words when the owner cancels because it cannot supply or serve.
export const OWNER_REFUND_NOTE = 'The customer receives a full refund of the verified down payment, with no transportation fee, on any date.';

// The text a choice needs, or null when it needs none.
export const needsText = (choice) => choice === 'owner' || choice === 'other';

// { body } for adminUpdateBooking, or { problem } when the dialog may not send yet (no choice, or the text is missing or too short or too long).
export function cancelRequest(choice, text = '') {
  if (!CANCEL_CHOICES.some((c) => c.key === choice)) return { problem: 'Choose a reason for cancelling.' };
  if (choice === 'customer') return { body: { status: 'Cancelled', cancelReason: 'Customer request' } };
  const reason = String(text || '').trim();
  if (reason.length < REASON_MIN) {
    return { problem: choice === 'owner' ? `Say in a few words what we cannot supply or serve (at least ${REASON_MIN} characters).` : `Give a short reason (at least ${REASON_MIN} characters).` };
  }
  if (reason.length > REASON_MAX) return { problem: `Keep the reason to ${REASON_MAX} characters or fewer.` };
  return choice === 'owner'
    ? { body: { status: 'Cancelled', ownerInitiated: true, cancelReason: reason } }
    : { body: { status: 'Cancelled', cancelReason: reason } };
}
