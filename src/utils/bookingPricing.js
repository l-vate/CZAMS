import { computeAmount } from './promos';

// Shared unit-pricing helpers for customer, admin, and staff views. Server-side mirror: server/utils/pricing.js - keep in sync.
//
// Order of operations, everywhere: units subtotal, minus the approved Senior/PWD
// discount, gives the discounted units subtotal. Down payment percentage and VAT work
// off that. Admin-entered distance/mobilization charges are added on top afterwards and
// are never discounted.

// "₱1,234", or "-₱800" for a negative amount (a discount line).
export function formatPeso(amount) {
  const n = Number(amount) || 0;
  return `${n < 0 ? '-' : ''}₱${Math.abs(n).toLocaleString()}`;
}

// The price for one unit of `unitType` under `service` - its unitTypePricing override if the
// admin set one for that type, otherwise the service's flat base price.
export function getUnitPrice(service, unitType) {
  const override = service?.unitTypePricing?.find((p) => p.unitType === unitType);
  return override ? override.price : (service?.price || 0);
}

// The discount a saved booking gets. A promo and an Approved Senior/PWD discount do not stack:
// whichever takes off more is applied (a tie goes to the promo). A Pending or Rejected
// Senior/PWD request counts as 0. The promo amount is recomputed from the promo as it was
// when the booking was made, so later promo edits never change it.
export function getAppliedDiscount(booking, grossUnitsSubtotal) {
  const promo = booking?.promo?.promoId
    ? computeAmount(booking.promo.discountType, booking.promo.discountValue, grossUnitsSubtotal)
    : 0;
  const seniorApproved = booking?.discount?.status === 'Approved';
  const senior = seniorApproved ? Math.round(grossUnitsSubtotal * ((booking.discount.percent || 0) / 100)) : 0;

  if (promo === 0 && senior === 0) return { amount: 0, kind: null, label: '', note: '' };
  if (promo >= senior) {
    return {
      amount: promo,
      kind: 'promo',
      label: `Promo: ${booking.promo.name}`,
      note: senior > 0 ? 'Your Senior/PWD discount was approved but is not applied: the promo gives you more.' : '',
    };
  }
  return {
    amount: senior,
    kind: 'senior',
    label: 'Senior/PWD Discount',
    note: promo > 0 ? `The promo "${booking.promo.name}" is not applied: your Senior/PWD discount gives you more.` : '',
  };
}

// Itemizes an already-saved booking (as returned by the API, `service` populated). Bookings created
// before the Multi-Unit Booking Redesign have no `units`, only the old flat `unitTypes` list - each
// listed type is treated as quantity 1. Nothing freezes a price at booking time, so these totals
// follow the service's current pricing. A booking with no unit data at all falls back to the flat
// service price (empty lineItems), same as the server.
export function getBookingLineItems(booking) {
  const service = booking?.service;
  const units = booking?.units?.length > 0
    ? booking.units
    : (booking?.unitTypes || []).map((type) => ({ type, quantity: 1, brandModel: booking?.brandModel || '' }));

  const lineItems = units.map((u) => {
    const unitPrice = getUnitPrice(service, u.type);
    return { ...u, unitPrice, subtotal: unitPrice * (u.quantity || 0) };
  });

  const grossUnitsSubtotal = lineItems.length > 0
    ? lineItems.reduce((sum, li) => sum + li.subtotal, 0)
    : (service?.price || 0);

  // Approved Senior/PWD discount: a negative line item (isDiscount, also flagged
  // isCharge so every screen that already lists the extra lines shows it without
  // being touched), deducted from the units subtotal before DP, VAT and balance.
  const applied = getAppliedDiscount(booking, grossUnitsSubtotal);
  const discountAmount = applied.amount;
  if (discountAmount > 0) {
    lineItems.push({ type: applied.label, quantity: 1, unitPrice: -discountAmount, subtotal: -discountAmount, isCharge: true, isDiscount: true });
  }
  const unitsSubtotal = grossUnitsSubtotal - discountAmount;

  // Distance/Mobilization Charges: admin-entered extras, appended as synthetic
  // line items (isCharge: true, distinct from a real unit entry). Never discounted.
  let chargesTotal = 0;
  if (booking?.distanceAdjustment) {
    lineItems.push({ type: 'Distance Based Charge', quantity: 1, unitPrice: booking.distanceAdjustment, subtotal: booking.distanceAdjustment, isCharge: true });
    chargesTotal += booking.distanceAdjustment;
  }
  if (booking?.mobilizationFee) {
    lineItems.push({ type: 'Mobilization/Demobilization Fee', quantity: 1, unitPrice: booking.mobilizationFee, subtotal: booking.mobilizationFee, isCharge: true });
    chargesTotal += booking.mobilizationFee;
  }

  // unitsSubtotal is the discounted units total, excluding admin-entered charges - the
  // down payment percentage applies only to it, never to the distance or mobilization
  // charge, which always fall into the remaining balance in full.
  return {
    lineItems,
    basePrice: unitsSubtotal + chargesTotal,
    chargesTotal,
    unitsSubtotal,
    grossUnitsSubtotal,
    discountAmount,
    discountLabel: applied.label,
    discountNote: applied.note,
  };
}

// Total, down payment and balance for a saved booking - the single place every screen
// gets them from. If the discount was approved after a down payment had already been
// verified, what the customer really paid stands (nothing is auto-refunded): the
// balance is just lower, floored at 0, and any excess is reported as `overpaid`.
export function getPaymentBreakdown(booking) {
  const { basePrice, unitsSubtotal, discountAmount } = getBookingLineItems(booking);
  const due = Math.round(unitsSubtotal * ((booking?.downPaymentPercent || 0) / 100));
  const alreadyPaid = booking?.discount?.status === 'Approved' ? (booking.discount.dpPaidBeforeApproval || 0) : 0;
  const downPayment = alreadyPaid > 0 ? alreadyPaid : due;
  const rawBalance = basePrice - downPayment;
  return {
    total: basePrice,
    downPayment,
    balance: Math.max(0, rawBalance),
    overpaid: rawBalance < 0 ? -rawBalance : 0,
    discountAmount,
  };
}

// Compact one-line description of a booking's units, e.g. "2× Split Type, 1× Floor Mounted".
// With `withBrand`, each entry's brand/model is appended: "2× Split Type (Carrier 1HP)".
// Excludes synthetic charge/discount line items - this describes
// the physical units, not admin-entered fees.
export function getUnitsSummary(booking, { withBrand = false } = {}) {
  const { lineItems } = getBookingLineItems(booking);
  return lineItems
    .filter((li) => !li.isCharge)
    .map((li) => `${li.quantity}× ${li.type}${withBrand && li.brandModel ? ` (${li.brandModel})` : ''}`)
    .join(', ');
}
