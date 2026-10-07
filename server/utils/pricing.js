// Server-side mirror of the frontend's pricing helpers (src/utils/bookingPricing.js).
// Keep the two in sync - the server needs its own copy because it is CommonJS and separate from the Vite bundle.
//
// Order of operations, everywhere: units subtotal, minus the approved Senior/PWD
// discount, gives the discounted units subtotal. Down payment percentage and VAT work
// off that. Admin-entered distance/mobilization charges are added on top afterwards and
// are never discounted.

const { computeAmount } = require('./promos');

function getUnitPrice(service, unitType) {
  const override = service?.unitTypePricing?.find((p) => p.unitType === unitType);
  return override ? override.price : (service?.price || 0);
}

// Bookings created before the Multi-Unit Booking Redesign have no `units`, only the old
// flat `unitTypes` list - treat each listed type as quantity 1. A booking with neither
// falls back to the flat service price, matching what those bookings always displayed.
function getBookingGrossUnitsSubtotal(booking) {
  const service = booking?.service;
  const units = booking?.units?.length > 0
    ? booking.units
    : (booking?.unitTypes || []).map((type) => ({ type, quantity: 1 }));

  return units.length === 0
    ? (service?.price || 0)
    : units.reduce((sum, u) => sum + getUnitPrice(service, u.type) * (u.quantity || 0), 0);
}

// Total number of units ordered (what a promo's minimum is measured against).
function getBookingTotalQuantity(booking) {
  const units = booking?.units?.length > 0 ? booking.units : (booking?.unitTypes || []).map(() => ({ quantity: 1 }));
  return units.reduce((sum, u) => sum + (u.quantity || 0), 0);
}

// Pesos the booking's promo takes off. Recomputed from the promo as it was when the booking
// was made (type and value), never from the live promo.
function getPromoAmount(booking) {
  const promo = booking?.promo;
  if (!promo?.promoId) return 0;
  return computeAmount(promo.discountType, promo.discountValue, getBookingGrossUnitsSubtotal(booking));
}

// Pesos an Approved Senior/PWD discount would take off. Pending and Rejected requests are 0.
function getSeniorDiscountAmount(booking) {
  const discount = booking?.discount;
  if (!discount || discount.status !== 'Approved') return 0;
  return Math.round(getBookingGrossUnitsSubtotal(booking) * ((discount.percent || 0) / 100));
}

// Promo and Senior/PWD do not stack: the one that takes off more is applied. A tie goes to the
// promo (it was applied first, automatically).
function getAppliedDiscount(booking) {
  const promo = getPromoAmount(booking);
  const senior = getSeniorDiscountAmount(booking);
  if (promo === 0 && senior === 0) return { amount: 0, kind: null, promoAmount: 0, seniorAmount: 0 };
  return promo >= senior
    ? { amount: promo, kind: 'promo', promoAmount: promo, seniorAmount: senior }
    : { amount: senior, kind: 'senior', promoAmount: promo, seniorAmount: senior };
}

// Pesos taken off the units subtotal (the applied discount).
function getDiscountAmount(booking) {
  return getAppliedDiscount(booking).amount;
}

// The portion of the total the down payment percentage (and VAT) applies to: units
// minus the approved discount, excluding distance/mobilization charges.
function getBookingUnitsSubtotal(booking) {
  return getBookingGrossUnitsSubtotal(booking) - getDiscountAmount(booking);
}

// Distance/Mobilization Charges: admin-entered extras on top of the discounted unit
// pricing - real money the customer owes, so they belong in the same total a refund is
// calculated against.
function getBookingBasePrice(booking) {
  return getBookingUnitsSubtotal(booking) + (booking?.distanceAdjustment || 0) + (booking?.mobilizationFee || 0);
}

// Down payment and balance. If the discount was approved after a down payment had
// already been verified, what the customer actually paid stands (nothing is
// auto-refunded): the balance is just lower, floored at 0, and any excess is reported
// as `overpaid` so admin can see it.
function getPaymentBreakdown(booking) {
  const total = getBookingBasePrice(booking);
  const due = Math.round(getBookingUnitsSubtotal(booking) * ((booking?.downPaymentPercent || 0) / 100));
  const alreadyPaid = booking?.discount?.status === 'Approved' ? (booking.discount.dpPaidBeforeApproval || 0) : 0;
  const downPayment = alreadyPaid > 0 ? alreadyPaid : due;
  const rawBalance = total - downPayment;
  return {
    total,
    downPayment,
    balance: Math.max(0, rawBalance),
    overpaid: rawBalance < 0 ? -rawBalance : 0,
  };
}

module.exports = {
  getBookingTotalQuantity,
  getPromoAmount,
  getSeniorDiscountAmount,
  getAppliedDiscount,
  getUnitPrice,
  getBookingGrossUnitsSubtotal,
  getDiscountAmount,
  getBookingUnitsSubtotal,
  getBookingBasePrice,
  getPaymentBreakdown,
};
