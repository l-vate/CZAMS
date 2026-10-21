// When a customer may submit a payment proof. Pure, so the rules are tested without a database. The routes
// also make the status change itself atomic (a conditional update), so two submissions at once cannot both pass.
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const { invalid } = require('./validation');
const { ONLINE_PAYMENT_MODES } = require('../constants/paymentModes');

const DOWN_PAYMENT_BOOKING_STATUSES = Object.freeze([BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED]);
const BALANCE_BOOKING_STATUSES = Object.freeze([BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED]);
// A down payment can be sent while nothing was sent yet, or after the admin rejected the last proof.
const DOWN_PAYMENT_OPEN = Object.freeze([PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.REJECTED]);
// The same for the balance. A booking made before this field existed has none, which counts as None.
const BALANCE_OPEN = Object.freeze([BALANCE_PAYMENT_STATUS.NONE, BALANCE_PAYMENT_STATUS.REJECTED, null]);

// null when `mode` may be used by a customer for a payment submitted online, otherwise { status, message }. Only GCash and Bank
// Transfer qualify, for the down payment and for the balance. A blank mode is not a problem here (a 0% booking has none). The
// comparison ignores case and spaces, so "cash " cannot slip past.
function onlinePaymentModeProblem(mode) {
  const name = String(mode || '').trim().toLowerCase();
  if (name === '') return null;
  if (ONLINE_PAYMENT_MODES.some((m) => m.toLowerCase() === name)) return null;
  return invalid('Customers pay online by GCash or Bank Transfer only. Cash and cheque are recorded by our team on site.');
}
// kept under its old name: the first payment is checked by the same rule as every other online payment
const firstPaymentModeProblem = onlinePaymentModeProblem;

// null when the customer may send a down payment proof for this booking, otherwise { status, message }.
function downPaymentProblem(booking) {
  const modeProblem = onlinePaymentModeProblem(booking.paymentMode);
  if (modeProblem) return modeProblem;
  if (!DOWN_PAYMENT_BOOKING_STATUSES.includes(booking.status)) {
    return invalid(`A down payment cannot be sent for a booking that is ${booking.status}. It can be sent while the booking is Pending or Approved.`);
  }
  if (!(booking.downPaymentPercent > 0)) return invalid('No down payment is due for this booking.');
  if (booking.paymentStatus === PAYMENT_STATUS.TO_VERIFY) {
    return invalid('Your down payment is already waiting to be verified.');
  }
  if (!DOWN_PAYMENT_OPEN.includes(booking.paymentStatus)) {
    return invalid('The down payment for this booking has already been verified.');
  }
  return null;
}

// null when the customer may send a balance proof. `balance` is what is still due from getPaymentBreakdown.
function balanceProblem(booking, balance) {
  const modeProblem = onlinePaymentModeProblem(booking.paymentMode2);
  if (modeProblem) return modeProblem;
  if (!BALANCE_BOOKING_STATUSES.includes(booking.status)) {
    return invalid(`A balance payment cannot be sent for a booking that is ${booking.status}.`);
  }
  const downPaymentSettled = !(booking.downPaymentPercent > 0)
    || [PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(booking.paymentStatus);
  if (!downPaymentSettled) return invalid('Pay and have the down payment verified before the balance.');
  if (!(balance > 0)) return invalid('No balance is due for this booking.');
  if (booking.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY) {
    return invalid('Your balance payment is already waiting to be verified.');
  }
  if (!BALANCE_OPEN.includes(booking.balancePaymentStatus || null)) {
    return invalid('The balance for this booking has already been verified.');
  }
  return null;
}

module.exports = {
  DOWN_PAYMENT_BOOKING_STATUSES, BALANCE_BOOKING_STATUSES, DOWN_PAYMENT_OPEN, BALANCE_OPEN,
  downPaymentProblem, balanceProblem, firstPaymentModeProblem, onlinePaymentModeProblem,
};
