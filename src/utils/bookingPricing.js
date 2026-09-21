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

  const basePrice = lineItems.length > 0
    ? lineItems.reduce((sum, li) => sum + li.subtotal, 0)
    : (service?.price || 0);
  return { lineItems, basePrice };
}

// Compact one-line description of a booking's units, e.g. "2× Split Type, 1× Floor Mounted".
// With `withBrand`, each entry's brand/model is appended: "2× Split Type (Carrier 1HP)".
export function getUnitsSummary(booking, { withBrand = false } = {}) {
  const { lineItems } = getBookingLineItems(booking);
  return lineItems
    .map((li) => `${li.quantity}× ${li.type}${withBrand && li.brandModel ? ` (${li.brandModel})` : ''}`)
    .join(', ');
}
