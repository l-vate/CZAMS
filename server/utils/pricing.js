// Server-side mirror of the frontend's getUnitPrice/getBookingLineItems (src/utils/bookingPricing.js).
// Keep the two in sync — the server needs its own copy because it is CommonJS and separate from the Vite bundle.

function getUnitPrice(service, unitType) {
  const override = service?.unitTypePricing?.find((p) => p.unitType === unitType);
  return override ? override.price : (service?.price || 0);
}

// Bookings created before the Multi-Unit Booking Redesign have no `units`, only the old
// flat `unitTypes` list — treat each listed type as quantity 1. A booking with neither
// falls back to the flat service price, matching what those bookings always displayed.
function getBookingBasePrice(booking) {
  const service = booking?.service;
  const units = booking?.units?.length > 0
    ? booking.units
    : (booking?.unitTypes || []).map((type) => ({ type, quantity: 1 }));

  if (units.length === 0) return service?.price || 0;

  return units.reduce((sum, u) => sum + getUnitPrice(service, u.type) * (u.quantity || 0), 0);
}

module.exports = { getUnitPrice, getBookingBasePrice };
