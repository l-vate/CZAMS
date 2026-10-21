// What an admin is allowed to refund. Pure, so every rule can be tested without a database.
const { invalid } = require('./validation');

const REASON_MIN = 3;
const REASON_MAX = 300;
const FEE_REASON_MAX = 200;

const peso = (n) => `₱${Number(n).toLocaleString()}`;

// `amountPaid` is the down payment the customer actually paid. For a cancellation on or after the booked date the
// dispatch deduction is the computed adjustment; for any other cancellation the computed amount is
// the full down payment. `finalAmount` is the admin's figure (blank means "refund the computed amount").
// Returns { problem, values }: problem is null or { status, message }; values are the refund fields to store.
//
// On or after the booked date the owner decides a transportation fee (dispatchDeduction): required, from 0 (the crew had not left) up to the
// down payment, so the refund never goes negative. A short reason for the fee is kept with it (dispatchReason, up to 200 characters).
function resolveRefundAmounts({ amountPaid, isSameDay, dispatchDeduction, dispatchReason, finalAmount, reason }) {
  const paid = Number(amountPaid) || 0;
  let computedAmount = paid;
  let adjustmentReason;
  let feeReasonText;

  if (isSameDay) {
    const deduction = Number(dispatchDeduction);
    if (dispatchDeduction === undefined || dispatchDeduction === '' || !Number.isFinite(deduction) || deduction < 0) {
      return { problem: invalid('A transportation fee is required for a cancellation on or after the booked date. Enter 0 if the crew had not left.') };
    }
    if (deduction > paid) {
      return { problem: invalid(`The transportation fee cannot be more than the ${peso(paid)} down payment.`) };
    }
    const feeReason = typeof dispatchReason === 'string' ? dispatchReason.trim() : '';
    if (feeReason.length > FEE_REASON_MAX) {
      return { problem: invalid(`Keep the reason for the transportation fee to ${FEE_REASON_MAX} characters or fewer.`) };
    }
    feeReasonText = feeReason || undefined;
    computedAmount = Math.max(paid - deduction, 0);
    adjustmentReason = `Transportation fee of ${peso(deduction)} for cancelling on or after the booked date`;
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

  // For a cancellation on or after the booked date the original down payment is the starting point and the
  // deduction is the adjustment, so the fields tell the whole story.
  return {
    problem: null,
    values: {
      computedAmount: isSameDay ? paid : computedAmount,
      finalAmount: final,
      adjustmentReason,
      dispatchReason: feeReasonText,
      adjusted: final !== (isSameDay ? paid : computedAmount),
    },
  };
}

module.exports = { REASON_MIN, REASON_MAX, FEE_REASON_MAX, resolveRefundAmounts };
