// Shared unit-pricing helpers for customer, admin, and staff views. Server-side mirror: server/utils/pricing.js — keep in sync.

// The price for one unit of `unitType` under `service` — its unitTypePricing override if the
// admin set one for that type, otherwise the service's flat base price.
export function getUnitPrice(service, unitType) {
  const override = service?.unitTypePricing?.find((p) => p.unitType === unitType);
  return override ? override.price : (service?.price || 0);
}

// Itemizes an already-saved booking (as returned by the API, `service` populated). Bookings created
// before the Multi-Unit Booking Redesign have no `units`, only the old flat `unitTypes` list — each
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

  let basePrice = lineItems.length > 0
    ? lineItems.reduce((sum, li) => sum + li.subtotal, 0)
    : (service?.price || 0);

  // Distance/Mobilization Charges: admin-entered extras, appended as synthetic
  // line items (isCharge: true, distinct from a real unit entry) — every screen
  // that already renders lineItems (Payment Modal, Booking Summary, Receipt,
  // admin modal) shows them for free, with no changes needed there.
  if (booking?.distanceAdjustment) {
    lineItems.push({ type: 'Distance Adjustment', quantity: 1, unitPrice: booking.distanceAdjustment, subtotal: booking.distanceAdjustment, isCharge: true });
    basePrice += booking.distanceAdjustment;
  }
  if (booking?.mobilizationFee) {
    lineItems.push({ type: 'Mobilization/Demobilization Fee', quantity: 1, unitPrice: booking.mobilizationFee, subtotal: booking.mobilizationFee, isCharge: true });
    basePrice += booking.mobilizationFee;
  }

  return { lineItems, basePrice };
}

// Compact one-line description of a booking's units, e.g. "2× Split Type, 1× Floor Mounted".
// With `withBrand`, each entry's brand/model is appended: "2× Split Type (Carrier 1HP)".
// Excludes synthetic charge line items (Distance Adjustment etc.) — this describes
// the physical units, not admin-entered fees.
export function getUnitsSummary(booking, { withBrand = false } = {}) {
  const { lineItems } = getBookingLineItems(booking);
  return lineItems
    .filter((li) => !li.isCharge)
    .map((li) => `${li.quantity}× ${li.type}${withBrand && li.brandModel ? ` (${li.brandModel})` : ''}`)
    .join(', ');
}
