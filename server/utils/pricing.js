// Server-side mirror of the frontend's pricing helpers (src/utils/bookingPricing.js).
// Keep the two in sync - the server needs its own copy because it is CommonJS and separate from the Vite bundle.
//
// Order of operations, everywhere: units subtotal, minus the approved Senior/PWD
// discount, gives the discounted units subtotal. Down payment percentage works off that
// and nothing else. Everything else the admin or the company adds is added on top
// afterwards, so it always falls into the remaining balance:
//   - scope of works lines the admin builds (scopeLines). Dismantling, installation, excess pipe and other service work are SERVICE
//     lines: the Senior/PWD discount applies to them, like it does to the units. A distance line is a CHARGE: never discounted.
//   - the unit a customer buys from Cooling Zone (units[].supplied: its price when it was chosen, times the quantity): never discounted.
//   - the distance based charge field and the mobilization fee, as before: never discounted.
// A distance line and the distanceAdjustment field are ONE charge, never two (see getDistanceTotal).

const { computeAmount } = require('./promos');
const scopeConstants = require('../constants/scopeLines.json');

const SERVICE_KINDS = scopeConstants.serviceKinds;

// The booking's scope of works lines that carry a real amount.
function scopeLinesOf(booking) {
  return (Array.isArray(booking?.scopeLines) ? booking.scopeLines : []).filter((l) => l && Number.isFinite(l.amount) && l.amount >= 0);
}

// Pesos of the service lines (dismantling, installation, excess pipe, other): the part of the scope the Senior/PWD discount applies to.
function getScopeServiceTotal(booking) {
  return scopeLinesOf(booking).filter((l) => SERVICE_KINDS.includes(l.kind)).reduce((sum, l) => sum + l.amount, 0);
}

// The distance based charge. Distance lines and the distanceAdjustment field are the same charge: when the booking has distance lines,
// they ARE the charge (the route that saves them also writes their total to distanceAdjustment, so the two always agree); otherwise the
// field is. It is never both, so the charge is counted once.
function getDistanceTotal(booking) {
  const lines = scopeLinesOf(booking).filter((l) => l.kind === 'distance');
  return lines.length > 0 ? lines.reduce((sum, l) => sum + l.amount, 0) : (booking?.distanceAdjustment || 0);
}

// What the unit entries the customer buys from Cooling Zone cost: the price each one was given when it was chosen (supplied.price,
// frozen then, so a later catalog edit never changes it) times its quantity. A request nobody has priced yet counts 0.
function getEquipmentTotal(booking) {
  return (booking?.units || []).reduce((sum, u) => (Number.isFinite(u?.supplied?.price) && u.supplied.price >= 0 ? sum + u.supplied.price * (u.quantity || 0) : sum), 0);
}

function getUnitPrice(service, unitType) {
  const override = service?.unitTypePricing?.find((p) => p.unitType === unitType);
  return override ? override.price : (service?.price || 0);
}

// The price of the unit at `index` on this booking. A booking made after prices were frozen carries the prices it was
// made at (priceSnapshot, see utils/priceSnapshot.js), so a later change to the service never changes it. An older
// booking has no snapshot and follows the service's current price, as before.
function unitPriceOf(booking, index, unit) {
  const line = booking?.priceSnapshot?.lines?.[index];
  if (line && line.type === unit.type && typeof line.unitPrice === 'number') return line.unitPrice;
  return getUnitPrice(booking?.service, unit.type);
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
    : units.reduce((sum, u, i) => sum + unitPriceOf(booking, i, u) * (u.quantity || 0), 0);
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

// The two parts of an Approved Senior/PWD discount: on the units, and on the service lines of the scope of works. Pending and Rejected
// requests are 0. They are rounded separately so the part on the units (which the down payment works off) is exactly what it was
// before scope lines existed.
function getSeniorParts(booking) {
  const discount = booking?.discount;
  if (!discount || discount.status !== 'Approved') return { onUnits: 0, onScope: 0 };
  const rate = (discount.percent || 0) / 100;
  return { onUnits: Math.round(getBookingGrossUnitsSubtotal(booking) * rate), onScope: Math.round(getScopeServiceTotal(booking) * rate) };
}

// Pesos an Approved Senior/PWD discount would take off: units plus service lines.
function getSeniorDiscountAmount(booking) {
  const { onUnits, onScope } = getSeniorParts(booking);
  return onUnits + onScope;
}

// Promo and Senior/PWD do not stack: the one that takes off more is applied. A tie goes to the
// promo (it was applied first, automatically). A promo works off the units only; a Senior/PWD discount also takes its percent off the
// service lines. onUnits and onScope say where the pesos come off.
function getAppliedDiscount(booking) {
  const promo = getPromoAmount(booking);
  const parts = getSeniorParts(booking);
  const senior = parts.onUnits + parts.onScope;
  if (promo === 0 && senior === 0) return { amount: 0, kind: null, promoAmount: 0, seniorAmount: 0, onUnits: 0, onScope: 0 };
  return promo >= senior
    ? { amount: promo, kind: 'promo', promoAmount: promo, seniorAmount: senior, onUnits: promo, onScope: 0 }
    : { amount: senior, kind: 'senior', promoAmount: promo, seniorAmount: senior, onUnits: parts.onUnits, onScope: parts.onScope };
}

// Pesos taken off the units subtotal (the applied discount).
function getDiscountAmount(booking) {
  return getAppliedDiscount(booking).amount;
}

// The portion of the total the down payment percentage applies to: units minus the part of the
// discount that comes off them. Scope of works lines, the unit a customer buys and every distance or
// mobilization charge are not in it: they fall into the remaining balance.
function getBookingUnitsSubtotal(booking) {
  return getBookingGrossUnitsSubtotal(booking) - getAppliedDiscount(booking).onUnits;
}

// Distance/Mobilization Charges: admin-entered extras on top of the discounted unit
// pricing - real money the customer owes, so they belong in the same total a refund is
// calculated against.
function getBookingBasePrice(booking) {
  const scopeServiceAfterDiscount = getScopeServiceTotal(booking) - getAppliedDiscount(booking).onScope;
  return getBookingUnitsSubtotal(booking) + scopeServiceAfterDiscount + getDistanceTotal(booking) + getEquipmentTotal(booking) + (booking?.mobilizationFee || 0);
}

// The VAT on a commercial booking. Normally 12% added on top of the base price. When the booking's quoted prices already include VAT
// (taxInclusive), the VAT is the part of the base price that is tax (12/112 of it) and nothing is added on top. Stored in vatAmount
// by the routes that change the price; a residential booking has none.
function getVatAmount(booking) {
  const base = getBookingBasePrice(booking);
  return booking?.taxInclusive ? Math.round((base * 12) / 112) : Math.round(base * 0.12);
}

// The rules for VAT and for the down payment base changed in E25 (pricingVersion 2, stamped on a booking when it is made). A booking made
// before that keeps the amounts it was paid and reported at once it is Completed, fully paid or cancelled: nothing stored is rewritten and
// its number never moves under the customer. Every other booking follows the current rules.
const PRICING_VERSION = 2;
function isPriceLocked(booking) {
  if ((booking?.pricingVersion || 1) >= PRICING_VERSION) return false;
  return booking?.status === 'Completed' || booking?.status === 'Cancelled'
    || booking?.paymentStatus === 'fully_paid' || booking?.balancePaid === true || booking?.balancePaymentStatus === 'paid';
}

// The VAT still to be paid on top of the base price: 12% for a commercial client unless the quoted prices already include it. 0 for a
// booking whose price is locked.
function getVatDue(booking) {
  if (!booking?.isCommercial || booking?.taxInclusive || isPriceLocked(booking)) return 0;
  return getVatAmount(booking);
}

// A down payment that was sent (waiting or verified) keeps the amount it was sent at; a rejected or unsent one follows the price.
const DOWN_SENT = ['to_verify', 'partially_paid', 'fully_paid'];

// The part of the price the down payment percentage works off: the BASE PRICE only, the discounted service units. Scope of works lines, the
// unit a customer buys, a distance or mobilization charge and VAT are not in it: they follow in the balance. (Owner decision, E25 follow-up.)
function getDownPaymentBase(booking) {
  return getBookingUnitsSubtotal(booking);
}

// Down payment and balance. total is the base price without VAT; vat is the VAT still to be added; grandTotal is what the customer owes in
// all. The balance is the grand total minus the down payment, so the VAT is collected in it. If the discount was approved after a down
// payment had already been verified, what the customer actually paid stands (nothing is auto-refunded): the balance is just lower, floored
// at 0, and any excess is reported as `overpaid` so admin can see it.
function getPaymentBreakdown(booking) {
  const total = getBookingBasePrice(booking);
  const vat = getVatDue(booking);
  const grandTotal = total + vat;
  const due = Math.round(getDownPaymentBase(booking) * ((booking?.downPaymentPercent || 0) / 100));
  const alreadyPaid = booking?.discount?.status === 'Approved' ? (booking.discount.dpPaidBeforeApproval || 0) : 0;
  const sentAmount = DOWN_SENT.includes(booking?.paymentStatus) && typeof booking?.downPaymentPaidAmount === 'number' ? booking.downPaymentPaidAmount : 0;
  const downPayment = alreadyPaid > 0 ? alreadyPaid : (sentAmount > 0 ? sentAmount : due);
  const rawBalance = grandTotal - downPayment;
  return {
    total,
    vat,
    grandTotal,
    downPayment,
    balance: Math.max(0, rawBalance),
    overpaid: rawBalance < 0 ? -rawBalance : 0,
  };
}

module.exports = {
  scopeLinesOf,
  getScopeServiceTotal,
  getDistanceTotal,
  getEquipmentTotal,
  getSeniorParts,
  unitPriceOf,
  getBookingTotalQuantity,
  getPromoAmount,
  getSeniorDiscountAmount,
  getAppliedDiscount,
  getUnitPrice,
  getBookingGrossUnitsSubtotal,
  getDiscountAmount,
  getBookingUnitsSubtotal,
  getBookingBasePrice,
  getVatAmount,
  getVatDue,
  isPriceLocked,
  getDownPaymentBase,
  PRICING_VERSION,
  getPaymentBreakdown,
};
