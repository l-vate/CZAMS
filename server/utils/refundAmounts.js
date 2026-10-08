// What an admin is allowed to refund. Pure, so every rule can be tested without a database.
const { invalid } = require('./validation');

const REASON_MIN = 3;
const REASON_MAX = 300;

const peso = (n) => `₱${Number(n).toLocaleString()}`;

// `amountPaid` is the down payment the customer actually paid. For a same-day cancellation the
// dispatch deduction is the computed adjustment; for any other cancellation the computed amount is
// the full down payment. `finalAmount` is the admin's figure (blank means "refund the computed amount").
// Returns { problem, values }: problem is null or { status, message }; values are the refund fields to store.
function resolveRefundAmounts({ amountPaid, isSameDay, dispatchDeduction, finalAmount, reason }) {
  const paid = Number(amountPaid) || 0;
  let computedAmount = paid;
  let adjustmentReason;

  if (isSameDay) {
    const deduction = Number(dispatchDeduction);
    if (dispatchDeduction === undefined || dispatchDeduction === '' || !Number.isFinite(deduction) || deduction < 0) {
      return { problem: invalid('A valid dispatch/transportation deduction amount is required for a same-day cancellation.') };
    }
    computedAmount = Math.max(paid - deduction, 0);
    adjustmentReason = `Same-day dispatch deduction of ${peso(Math.min(deduction, paid))}`;
  }

  const hasFinal = finalAmount !== undefined && finalAmount !== null && String(finalAmount).trim() !== '';
  let final = computedAmount;
  if (hasFinal) {
    final = Number(finalAmount);
    if (!Number.isFinite(final) || final < 0) return { problem: invalid('The refund amount must be a number that is not negative.') };
    if (final > paid) return { problem: invalid(`The refund cannot be more than the ${peso(paid)} the customer paid.`) };
  }

  const text = typeof reason === 'string' ? reason.trim() : '';
  if (final !== computedAmount) {
    if (text.length < REASON_MIN || text.length > REASON_MAX) {
      return { problem: invalid(`Give a reason of ${REASON_MIN} to ${REASON_MAX} characters for changing the refund amount.`) };
    }
    adjustmentReason = adjustmentReason ? `${adjustmentReason}. ${text}` : text;
  }

  // For a same-day cancellation the original down payment is the starting point and the
  // deduction is the adjustment, so the fields tell the whole story.
  return {
    problem: null,
    values: {
      computedAmount: isSameDay ? paid : computedAmount,
      finalAmount: final,
      adjustmentReason,
      adjusted: final !== (isSameDay ? paid : computedAmount),
    },
  };
}

module.exports = { REASON_MIN, REASON_MAX, resolveRefundAmounts };
