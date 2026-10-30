// What an admin may do to a booking's payment, and the record it leaves. The rules are pure so they are tested without a
// database; commitPayment applies a planned change as ONE conditional update (the expected old statuses are part of the
// filter), so two admins acting at once cannot both succeed and the customer is told once.
//
// Down payment statuses: Unpaid, to_verify, partially_paid, fully_paid, rejected.
// Balance statuses: None, to_verify, paid, rejected.
//   verify   to_verify -> verified. Needs the proof the customer sent. "Fully Paid" is never typed in: it is worked out
//            here (a 100% down payment, or the balance verified).
//   reject   to_verify -> rejected. Needs a reason, which the customer is told.
//   reverse  verified -> back for checking again. A documented action: needs a reason and is recorded.
// Every one of them adds a line to booking.paymentEvents: who, when, which payment, amount, outcome, reason.
const { PAYMENT_STATUS, PAYMENT_STATUS_VALUES, BALANCE_PAYMENT_STATUS, BALANCE_PAYMENT_STATUS_VALUES } = require('../constants/paymentStatus');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { invalid } = require('./validation');
const { getPaymentBreakdown, PRICING_VERSION } = require('./pricing');

const REASON_MIN = 3;
const REASON_MAX = 300;
const VERIFIED_DOWN = [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID];
const NONE = (v) => v === undefined || v === null;
const peso = (n) => `₱${Number(n).toLocaleString('en-US', Number.isInteger(Number(n)) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function reasonProblem(reason, what) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < REASON_MIN || text.length > REASON_MAX) return invalid(`Give a reason of ${REASON_MIN} to ${REASON_MAX} characters ${what}.`);
  return null;
}

// What the down payment came to: the amount fixed when it was sent or received, else (older bookings) the figure the price gives now.
const downPaymentAmount = (booking) => (typeof booking.downPaymentPaidAmount === 'number'
  ? booking.downPaymentPaidAmount
  : getPaymentBreakdown(booking).downPayment);

// Reads the payment part of an admin-update request. Returns { problem } or { plan } where plan is null (no payment change)
// or { track, action, expect, set, unset, event }.
function planPaymentChange(booking, { paymentStatus, balancePaymentStatus, balancePaid, reverse, reason } = {}) {
  if (balancePaid !== undefined) {
    return { problem: invalid('Fully Paid is worked out from the verified payments. Verify the balance instead of marking it paid.') };
  }
  const wantsDown = !NONE(paymentStatus);
  const wantsBalance = !NONE(balancePaymentStatus);
  const wantsReverse = !NONE(reverse);
  if ([wantsDown, wantsBalance, wantsReverse].filter(Boolean).length > 1) {
    return { problem: invalid('Change one payment at a time.') };
  }
  if (!wantsDown && !wantsBalance && !wantsReverse) return { plan: null };

  if (wantsReverse) return planReverse(booking, reverse, reason);

  if (wantsDown) {
    if (typeof paymentStatus !== 'string' || !PAYMENT_STATUS_VALUES.includes(paymentStatus)) {
      return { problem: invalid(`Payment status must be one of: ${PAYMENT_STATUS_VALUES.join(', ')}.`) };
    }
    if (booking.paymentStatus !== PAYMENT_STATUS.TO_VERIFY) {
      return { problem: invalid(paymentStatus === booking.paymentStatus
        ? 'That payment already has this status.'
        : 'Only a payment that is waiting to be verified can be verified or rejected. To record a payment made in person use Record payment; to undo a verification use Reverse.') };
    }
    if (paymentStatus === PAYMENT_STATUS.REJECTED) {
      const problem = reasonProblem(reason, 'for rejecting the payment');
      if (problem) return { problem };
      return { plan: {
        track: 'down', action: 'reject', expect: { paymentStatus: PAYMENT_STATUS.TO_VERIFY },
        set: { paymentStatus: PAYMENT_STATUS.REJECTED }, unset: ['proofFile', 'referenceNumber', 'downPaymentPaidAmount'],
        event: { track: 'down', status: 'rejected', amount: 0, reason: reason.trim() },
      } };
    }
    if (!VERIFIED_DOWN.includes(paymentStatus)) {
      return { problem: invalid('A payment can only be verified (Partially Paid or Fully Paid) or rejected.') };
    }
    if (!booking.proofFile) return { problem: invalid('There is no proof of payment to verify. The customer has not sent one.') };
    const amount = downPaymentAmount(booking);
    const full = (booking.downPaymentPercent || 0) >= 100;
    return { plan: {
      track: 'down', action: 'verify', expect: { paymentStatus: PAYMENT_STATUS.TO_VERIFY },
      set: { paymentStatus: full ? PAYMENT_STATUS.FULLY_PAID : PAYMENT_STATUS.PARTIALLY_PAID, downPaymentPaidAmount: amount },
      unset: [], event: { track: 'down', status: 'verified', amount },
    } };
  }

  // the balance track
  if (typeof balancePaymentStatus !== 'string' || !BALANCE_PAYMENT_STATUS_VALUES.includes(balancePaymentStatus)) {
    return { problem: invalid(`Balance status must be one of: ${BALANCE_PAYMENT_STATUS_VALUES.join(', ')}.`) };
  }
  if (booking.balancePaymentStatus !== BALANCE_PAYMENT_STATUS.TO_VERIFY) {
    return { problem: invalid('Only a balance payment that is waiting to be verified can be verified or rejected. To undo a verification use Reverse.') };
  }
  if (balancePaymentStatus === BALANCE_PAYMENT_STATUS.REJECTED) {
    const problem = reasonProblem(reason, 'for rejecting the payment');
    if (problem) return { problem };
    return { plan: {
      track: 'balance', action: 'reject', expect: { balancePaymentStatus: BALANCE_PAYMENT_STATUS.TO_VERIFY },
      set: { balancePaymentStatus: BALANCE_PAYMENT_STATUS.REJECTED }, unset: ['balanceProofFile', 'balanceReferenceNumber'],
      event: { track: 'balance', status: 'rejected', amount: 0, reason: reason.trim() },
    } };
  }
  if (balancePaymentStatus !== BALANCE_PAYMENT_STATUS.PAID) {
    return { problem: invalid('A balance payment can only be verified (Paid) or rejected.') };
  }
  const downSettled = !((booking.downPaymentPercent || 0) > 0) || VERIFIED_DOWN.includes(booking.paymentStatus);
  if (!downSettled) return { problem: invalid('Verify the down payment before the balance.') };
  if (!booking.balanceProofFile) return { problem: invalid('There is no proof of payment to verify. The customer has not sent one.') };
  const amount = getPaymentBreakdown(booking).balance;
  return { plan: {
    track: 'balance', action: 'verify',
    expect: { balancePaymentStatus: BALANCE_PAYMENT_STATUS.TO_VERIFY, paymentStatus: booking.paymentStatus },
    // pricingVersion: the balance was worked out with the current rules (VAT included), so those amounts stay when the booking is fully paid
    set: { balancePaymentStatus: BALANCE_PAYMENT_STATUS.PAID, balancePaid: true, paymentStatus: PAYMENT_STATUS.FULLY_PAID, pricingVersion: PRICING_VERSION },
    unset: [], event: { track: 'balance', status: 'verified', amount },
  } };
}

function planReverse(booking, track, reason) {
  const problem = reasonProblem(reason, 'for reversing a verified payment');
  if (problem) return { problem };
  if (track === 'down') {
    if (!VERIFIED_DOWN.includes(booking.paymentStatus)) return { problem: invalid('Only a verified down payment can be reversed.') };
    if (booking.refund && booking.refund.status && booking.refund.status !== 'None') return { problem: invalid('A refund is open on this booking and depends on this payment, so it cannot be reversed.') };
    if (booking.balancePaymentStatus === BALANCE_PAYMENT_STATUS.PAID) return { problem: invalid('Reverse the balance payment first.') };
    return { plan: {
      track: 'down', action: 'reverse', expect: { paymentStatus: booking.paymentStatus },
      // back to checking when a proof is on file, otherwise back to unpaid
      set: { paymentStatus: booking.proofFile ? PAYMENT_STATUS.TO_VERIFY : PAYMENT_STATUS.UNPAID }, unset: ['downPaymentPaidAmount'],
      event: { track: 'down', status: 'reversed', amount: downPaymentAmount(booking), reason: reason.trim() },
    } };
  }
  if (track === 'balance') {
    if (booking.balancePaymentStatus !== BALANCE_PAYMENT_STATUS.PAID) return { problem: invalid('Only a verified balance payment can be reversed.') };
    return { plan: {
      track: 'balance', action: 'reverse', expect: { balancePaymentStatus: BALANCE_PAYMENT_STATUS.PAID },
      set: {
        balancePaymentStatus: booking.balanceProofFile ? BALANCE_PAYMENT_STATUS.TO_VERIFY : BALANCE_PAYMENT_STATUS.NONE,
        balancePaid: false,
        paymentStatus: (booking.downPaymentPercent || 0) >= 100 ? PAYMENT_STATUS.FULLY_PAID : PAYMENT_STATUS.PARTIALLY_PAID,
      },
      unset: [], event: { track: 'balance', status: 'reversed', amount: getPaymentBreakdown(booking).balance, reason: reason.trim() },
    } };
  }
  return { problem: invalid('Reverse "down" or "balance".') };
}

// Applies a plan as one conditional update. Returns the updated booking document, or null when the booking was not in the
// state the plan expected (someone else changed it first, or it was cancelled). `actor` is { id, name }.
async function commitPayment(Booking, booking, plan, actor, now = new Date(), { allowCancelled = false } = {}) {
  const expect = { ...plan.expect };
  // an older booking may have no balance status stored (it reads as None)
  if (expect.balancePaymentStatus === BALANCE_PAYMENT_STATUS.NONE) expect.balancePaymentStatus = { $in: [BALANCE_PAYMENT_STATUS.NONE, null] };
  // A cancelled booking cannot be changed, except to check the proof it was cancelled with (allowCancelled, and the flag in `expect`).
  const filter = { _id: booking._id, ...(allowCancelled ? {} : { status: { $ne: BOOKING_STATUS.CANCELLED } }), ...expect };
  const update = {
    $set: plan.set,
    $push: { paymentEvents: { ...plan.event, by: { id: actor.id, name: actor.name }, at: now } },
  };
  if (plan.unset.length > 0) update.$unset = Object.fromEntries(plan.unset.map((k) => [k, 1]));
  return Booking.findOneAndUpdate(filter, update, { new: true });
}

// An in-person payment the admin received (cash or cheque, or GCash or a bank transfer shown at the counter). The booking is
// marked Verified by the admin who received it. Returns { problem } or { plan } (same shape as above).
function planInPersonPayment(booking, { track, method, amount, reference, allowedMethods }) {
  if (!['down', 'balance'].includes(track)) return { problem: invalid('Choose which payment this is: down payment or balance.') };
  if (typeof method !== 'string' || !allowedMethods.includes(method)) return { problem: invalid(`Choose a payment method: ${allowedMethods.join(', ')}.`) };
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return { problem: invalid('Enter the amount received, more than 0.') };
  const ref = typeof reference === 'string' ? reference.trim().slice(0, 60) : '';
  if (booking.status === BOOKING_STATUS.CANCELLED) return { problem: invalid('This booking is cancelled.') };
  const event = { track, status: 'recorded', amount: Math.round(value * 100) / 100, method, reference: ref || undefined, inPerson: true };

  if (track === 'down') {
    if (!((booking.downPaymentPercent || 0) > 0)) return { problem: invalid('No down payment is due for this booking.') };
    if (![PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.REJECTED].includes(booking.paymentStatus)) {
      return { problem: invalid('The down payment is already waiting to be verified or has been verified.') };
    }
    const full = (booking.downPaymentPercent || 0) >= 100;
    // Nothing is paid yet, so the most that can be received is everything the booking comes to. A 100% down payment marks the booking fully
    // paid, so it has to be the whole amount.
    const owed = getPaymentBreakdown(booking).grandTotal;
    if (event.amount > owed) return { problem: invalid(`The amount is more than the booking comes to. At most ${peso(owed)} can be recorded.`) };
    if (full && event.amount < owed) return { problem: invalid(`This is a full payment, so the whole ${peso(owed)} has to be recorded.`) };
    return { plan: {
      track, action: 'record', expect: { paymentStatus: booking.paymentStatus },
      set: { paymentStatus: full ? PAYMENT_STATUS.FULLY_PAID : PAYMENT_STATUS.PARTIALLY_PAID, downPaymentPaidAmount: event.amount, paymentMode: method },
      unset: ['proofFile', 'referenceNumber'], event,
    } };
  }
  const downSettled = !((booking.downPaymentPercent || 0) > 0) || VERIFIED_DOWN.includes(booking.paymentStatus);
  if (!downSettled) return { problem: invalid('Verify the down payment before the balance.') };
  if (![BALANCE_PAYMENT_STATUS.NONE, BALANCE_PAYMENT_STATUS.REJECTED, undefined, null].includes(booking.balancePaymentStatus)) {
    return { problem: invalid('The balance is already waiting to be verified or has been verified.') };
  }
  const remaining = getPaymentBreakdown(booking).balance;
  if (!(remaining > 0)) return { problem: invalid('No balance is due for this booking.') };
  if (event.amount > remaining) return { problem: invalid(`The amount is more than the remaining balance. At most ${peso(remaining)} can be recorded.`) };
  // recording the balance marks the booking fully paid, so a part of it cannot be recorded here
  if (event.amount < remaining) return { problem: invalid(`The remaining balance is ${peso(remaining)}. Record the whole balance: it marks the booking fully paid.`) };
  return { plan: {
    track, action: 'record', expect: { balancePaymentStatus: booking.balancePaymentStatus ?? BALANCE_PAYMENT_STATUS.NONE, paymentStatus: booking.paymentStatus },
    set: { balancePaymentStatus: BALANCE_PAYMENT_STATUS.PAID, balancePaid: true, paymentStatus: PAYMENT_STATUS.FULLY_PAID, paymentMode2: method, pricingVersion: PRICING_VERSION },
    unset: ['balanceProofFile', 'balanceReferenceNumber'], event,
  } };
}

module.exports = { planPaymentChange, planInPersonPayment, commitPayment, REASON_MIN, REASON_MAX };
