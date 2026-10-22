import { computeAmount } from './promos';

// Shared unit-pricing helpers for customer, admin, and staff views. Server-side mirror: server/utils/pricing.js - keep in sync.
//
// Order of operations, everywhere: units subtotal, minus the approved Senior/PWD
// discount, gives the discounted units subtotal. Down payment percentage works off that
// and nothing else. Everything else is added on top afterwards and falls into the remaining balance:
// scope of works lines (service lines take the Senior/PWD discount, a distance line never does), the unit a customer buys from
// the company (its price when it was chosen times the quantity, never discounted), and the distance and mobilization charges.
// A distance line and the distanceAdjustment field are one charge, never two. Server mirror of all of it: server/utils/pricing.js.
import scopeConstants from '../../server/constants/scopeLines.json';

const SERVICE_KINDS = scopeConstants.serviceKinds;

// "₱1,234", or "-₱800" for a negative amount (a discount line). Two decimals only when the amount is not a whole number: "₱1,234.50".
export function formatPeso(amount) {
  const n = Number(amount) || 0;
  const fraction = Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${n < 0 ? '-' : ''}₱${Math.abs(n).toLocaleString('en-US', fraction)}`;
}

// The price for one unit of `unitType` under `service` - its unitTypePricing override if the
// admin set one for that type, otherwise the service's flat base price.
export function getUnitPrice(service, unitType) {
  const override = service?.unitTypePricing?.find((p) => p.unitType === unitType);
  return override ? override.price : (service?.price || 0);
}

// The price of the unit at `index` on a saved booking. A booking made after prices were frozen carries the prices it was
// made at (priceSnapshot), so a later change to the service never changes it. An older booking has none and follows the
// service's current price. Server mirror: unitPriceOf in server/utils/pricing.js.
export function unitPriceOf(booking, index, unit) {
  const line = booking?.priceSnapshot?.lines?.[index];
  if (line && line.type === unit.type && typeof line.unitPrice === 'number') return line.unitPrice;
  return getUnitPrice(booking?.service, unit.type);
}

// The discount a saved booking gets. A promo and an Approved Senior/PWD discount do not stack:
// whichever takes off more is applied (a tie goes to the promo). A Pending or Rejected
// Senior/PWD request counts as 0. The promo amount is recomputed from the promo as it was
// when the booking was made, so later promo edits never change it.
// The scope of works lines that carry a real amount.
export function scopeLinesOf(booking) {
  return (Array.isArray(booking?.scopeLines) ? booking.scopeLines : []).filter((l) => l && Number.isFinite(l.amount) && l.amount >= 0);
}

// Pesos of the service lines (dismantling, installation, excess pipe, other): the part of the scope the Senior/PWD discount applies to.
export function getScopeServiceTotal(booking) {
  return scopeLinesOf(booking).filter((l) => SERVICE_KINDS.includes(l.kind)).reduce((sum, l) => sum + l.amount, 0);
}

// The distance based charge: the distance lines when the booking has any, otherwise the distanceAdjustment field. Never both.
export function getDistanceTotal(booking) {
  const lines = scopeLinesOf(booking).filter((l) => l.kind === 'distance');
  return lines.length > 0 ? lines.reduce((sum, l) => sum + l.amount, 0) : (booking?.distanceAdjustment || 0);
}

// The unit entries bought from the company: the price each had when it was chosen times its quantity.
export function getEquipmentTotal(booking) {
  return (booking?.units || []).reduce((sum, u) => (Number.isFinite(u?.supplied?.price) && u.supplied.price >= 0 ? sum + u.supplied.price * (u.quantity || 0) : sum), 0);
}

export function getAppliedDiscount(booking, grossUnitsSubtotal) {
  const promo = booking?.promo?.promoId
    ? computeAmount(booking.promo.discountType, booking.promo.discountValue, grossUnitsSubtotal)
    : 0;
  const seniorApproved = booking?.discount?.status === 'Approved';
  const rate = seniorApproved ? (booking.discount.percent || 0) / 100 : 0;
  const seniorOnUnits = Math.round(grossUnitsSubtotal * rate);
  const seniorOnScope = Math.round(getScopeServiceTotal(booking) * rate);
  const senior = seniorOnUnits + seniorOnScope;

  if (promo === 0 && senior === 0) return { amount: 0, kind: null, label: '', note: '', onUnits: 0, onScope: 0 };
  if (promo >= senior) {
    return {
      amount: promo,
      kind: 'promo',
      onUnits: promo,
      onScope: 0,
      label: `Promo: ${booking.promo.name}`,
      note: senior > 0 ? 'Your Senior/PWD discount was approved but is not applied: the promo gives you more.' : '',
    };
  }
  return {
    amount: senior,
    kind: 'senior',
    onUnits: seniorOnUnits,
    onScope: seniorOnScope,
    label: `${booking.discount.type === 'PWD' ? 'PWD' : 'Senior Citizen'} discount (${booking.discount.percent || 0}%)`,
    note: promo > 0 ? `The promo "${booking.promo.name}" is not applied: your Senior/PWD discount gives you more.` : '',
  };
}

// Itemizes an already-saved booking (as returned by the API, `service` populated). Bookings created
// before the Multi-Unit Booking Redesign have no `units`, only the old flat `unitTypes` list - each
// listed type is treated as quantity 1. A booking made after prices were frozen uses its own snapshot; an older one
// follows the service's current pricing. A booking with no unit data at all falls back to the flat
// service price (empty lineItems), same as the server.
export function getBookingLineItems(booking) {
  const service = booking?.service;
  const units = booking?.units?.length > 0
    ? booking.units
    : (booking?.unitTypes || []).map((type) => ({ type, quantity: 1, brandModel: booking?.brandModel || '' }));

  const lineItems = units.map((u, index) => {
    const unitPrice = unitPriceOf(booking, index, u);
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
  // What the down payment works off: the units less the part of the discount that comes off them.
  const unitsSubtotal = grossUnitsSubtotal - applied.onUnits;

  // Distance/Mobilization Charges: admin-entered extras, appended as synthetic
  // line items (isCharge: true, distinct from a real unit entry). Never discounted.
  let chargesTotal = 0;
  // The unit bought from the company, one line per unit entry that has a price (never discounted).
  (booking?.units || []).forEach((u) => {
    if (Number.isFinite(u?.supplied?.price) && u.supplied.price >= 0) {
      const name = [u.supplied.brand, u.supplied.model].filter(Boolean).join(' ');
      lineItems.push({ type: `Unit: ${name}${u.supplied.inverter ? ' (inverter)' : ''}`, quantity: u.quantity || 0, unitPrice: u.supplied.price, subtotal: u.supplied.price * (u.quantity || 0), isCharge: true, isEquipment: true });
      chargesTotal += u.supplied.price * (u.quantity || 0);
    }
  });
  // The scope of works lines the admin built. Service lines share the discount; a distance line never does.
  scopeLinesOf(booking).forEach((l) => {
    lineItems.push({ type: l.description, quantity: l.quantity, unitPrice: l.unitRate, unitLabel: l.unitLabel, subtotal: l.amount, isCharge: true, isScope: true, kind: l.kind });
    if (SERVICE_KINDS.includes(l.kind)) chargesTotal += l.amount;
  });
  chargesTotal -= applied.onScope; // the discount on the service lines
  const distanceTotal = getDistanceTotal(booking);
  const scopeHasDistance = scopeLinesOf(booking).some((l) => l.kind === 'distance');
  if (scopeHasDistance) {
    chargesTotal += distanceTotal; // already listed above, one line each
  } else if (distanceTotal) {
    lineItems.push({ type: 'Distance Based Charge', quantity: 1, unitPrice: distanceTotal, subtotal: distanceTotal, isCharge: true });
    chargesTotal += distanceTotal;
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
