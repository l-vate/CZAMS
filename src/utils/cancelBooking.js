// The admin's Cancel Booking dialog: the reasons to choose from and the request each one sends. Plain functions (no framework, so the tests load this
// file on its own). The whole down payment is refunded for every reason except two (E34): the customer was not available at the address, or the technicians
// were already on the way. For those two the admin types how much to keep from the down payment (0 up to the down payment). "We cannot supply or serve" is
// the owner cancelling: the whole verified down payment goes back with no deduction.
// The keys of the two deduction reasons are the server's (server/constants/cancelKinds.js); a test keeps them equal.
export const CANCEL_CHOICES = Object.freeze([
  { key: 'customer', label: 'Customer request' },
  { key: 'customer_unavailable', label: 'Customer not available at the address', deduction: true },
  { key: 'technicians_on_the_way', label: 'Technicians already on the way', deduction: true },
  { key: 'owner', label: 'We cannot supply or serve' },
  { key: 'other', label: 'Other' },
]);

export const REASON_MIN = 3;
export const REASON_MAX = 200;

// What the dialog says in plain words for the reasons that refund the whole down payment.
export const OWNER_REFUND_NOTE = 'The customer receives a full refund of the verified down payment, with no deduction.';
export const FULL_REFUND_CHOICE_NOTE = 'The customer receives a full refund of the verified down payment.';

// The reasons offered for a booking in this status. A customer cannot cancel a booking that is In Progress, so "Customer request" and "Other" are not
// offered there; a deduction needs a crew that was on the way, so it is not offered on a Pending booking (nobody is assigned yet).
export function choicesFor(status) {
  if (status === 'In Progress') return CANCEL_CHOICES.filter((c) => c.deduction || c.key === 'owner');
  if (status === 'Pending') return CANCEL_CHOICES.filter((c) => !c.deduction);
  return CANCEL_CHOICES;
}

// The text a choice needs, or null when it needs none.
export const needsText = (choice) => choice === 'owner' || choice === 'other';

// The choices that keep part of the down payment: the admin types the amount.
export const needsAmount = (choice) => CANCEL_CHOICES.some((c) => c.key === choice && c.deduction);

// What the customer gets back for an amount typed in the dialog, or null when it is not a usable amount yet.
export function refundAfter(limit, amountText) {
  const raw = String(amountText ?? '').trim();
  const amount = Number(raw);
  if (raw === '' || !Number.isFinite(amount) || amount < 0 || amount > limit) return null;
  return Math.round((limit - amount) * 100) / 100;
}

// { body } for adminUpdateBooking, or { problem } when the dialog may not send yet (no choice, the text is missing or too short or too long, or the amount
// is missing, negative or more than the down payment). `limit` is the down payment the amount may not go above.
export function cancelRequest(choice, text = '', amountText = '', limit = 0) {
  if (!CANCEL_CHOICES.some((c) => c.key === choice)) return { problem: 'Choose a reason for cancelling.' };
  if (needsAmount(choice)) {
    const raw = String(amountText ?? '').trim();
    const amount = Number(raw);
    if (raw === '' || !Number.isFinite(amount)) return { problem: 'Enter the amount to keep from the down payment (0 if nothing is kept).' };
    if (amount < 0) return { problem: 'The amount cannot be negative.' };
    if (amount > limit) return { problem: 'The amount cannot be more than the down payment.' };
    return { body: { status: 'Cancelled', cancelKind: choice, deductionAmount: Math.round(amount * 100) / 100 } };
  }
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
