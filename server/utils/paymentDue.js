// What is due from the customer right now, and why an admin cannot approve yet. Pure, so the rules are tested without a database and one
// answer is shared by the routes, the customer's Billing and the admin's booking screen.
//
// The down payment falls due as soon as the booking exists, with one exception: an Installation whose unit Cooling Zone supplies. The owner
// has to confirm the unit first (a unit request settled, or a catalog unit confirmed), and only then is the customer asked to pay. The
// balance falls due when the service is Completed. A booking with no down payment (agreed terms) has nothing due up front.
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { unitsNeedingOwner } = require('./suppliedUnits');
const { getPaymentBreakdown } = require('./pricing');

const DOWN_OPEN = [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.REJECTED];
const BALANCE_OPEN = [BALANCE_PAYMENT_STATUS.NONE, BALANCE_PAYMENT_STATUS.REJECTED, null, undefined];
const VERIFIED_DOWN = [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID];

const hasDownPayment = (booking) => booking.downPaymentPercent > 0;

// True while an Installation that Cooling Zone supplies the unit for still waits for the owner: a request is open, the owner declined it, or
// nobody has confirmed the unit yet. Only a booking that is still Pending can be waiting.
function unitAwaitingConfirmation(booking) {
  if (booking.service?.serviceType !== SERVICE_TYPE.INSTALLATION) return false;
  if (booking.status !== BOOKING_STATUS.PENDING) return false;
  if (booking.clientSuppliedUnit) return false;
  const supplied = (booking.units || []).some((u) => u && u.supplied);
  if (!supplied) return false;
  if (unitsNeedingOwner(booking.units).length > 0) return true;
  if (booking.unitDecline && booking.unitDecline.reason) return true;
  return !booking.unitConfirmedAt;
}

// { kind: 'down' | 'balance' | null, amount, waitingForUnit }. waitingForUnit is true when the down payment would be due but the owner has not
// confirmed the unit yet (nothing is due, and the customer is told so).
function paymentDueOf(booking) {
  const none = { kind: null, amount: 0, waitingForUnit: false };
  if (!booking || booking.status === BOOKING_STATUS.CANCELLED || booking.isBackJob) return none;
  const breakdown = getPaymentBreakdown(booking);

  if (hasDownPayment(booking) && DOWN_OPEN.includes(booking.paymentStatus)
    && [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED].includes(booking.status)) {
    if (unitAwaitingConfirmation(booking)) return { ...none, waitingForUnit: true };
    return { kind: 'down', amount: breakdown.downPayment, waitingForUnit: false };
  }

  const downSettled = !hasDownPayment(booking) || VERIFIED_DOWN.includes(booking.paymentStatus);
  if (downSettled && booking.status === BOOKING_STATUS.COMPLETED && breakdown.balance > 0 && BALANCE_OPEN.includes(booking.balancePaymentStatus)) {
    return { kind: 'balance', amount: breakdown.balance, waitingForUnit: false };
  }
  return none;
}

// Why a Pending booking cannot be approved because of money, or null. { code, message }. The route refuses with this message, and the admin's
// booking screen shows it beside a disabled Approve button, so a refusal is never silent.
function approvalPaymentBlock(booking) {
  if (!hasDownPayment(booking)) return null;
  if (getPaymentBreakdown(booking).downPayment <= 0) return null;
  if (VERIFIED_DOWN.includes(booking.paymentStatus)) return null;
  if (unitAwaitingConfirmation(booking)) {
    return { code: 'unit', message: 'Confirm the unit first. The customer is asked to pay the down payment once it is confirmed.' };
  }
  if (booking.paymentStatus === PAYMENT_STATUS.TO_VERIFY) {
    return { code: 'verify', message: 'The down payment was submitted. Verify it first, then approve the booking.' };
  }
  return { code: 'waiting', message: "Waiting for the customer's down payment." };
}

module.exports = { unitAwaitingConfirmation, paymentDueOf, approvalPaymentBlock };
