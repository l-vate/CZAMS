// The prices a booking was made at, frozen on the booking. Without it every total, invoice, receipt, statement and report
// would follow the service's CURRENT price, so editing a service would rewrite bookings that were already paid or done.
// Totals read it through utils/pricing.js (unitPriceOf). A booking made before this existed has no snapshot and still
// follows the service's current price: nothing is migrated.
const { getUnitPrice } = require('./pricing');

// `service` is the service document (plain or Mongoose) the booking is for; `units` are the validated booking units.
function buildPriceSnapshot(service, units) {
  const lines = units.map((u) => {
    const unitPrice = getUnitPrice(service, u.type);
    return { type: u.type, quantity: u.quantity, unitPrice, lineTotal: unitPrice * u.quantity };
  });
  return {
    serviceId: String(service._id),
    serviceName: service.name,
    serviceType: service.serviceType,
    // for a Cleaning booking the tier is the service itself (regular, deep or pull-down), named as it was then
    tier: service.serviceType === 'Cleaning' ? service.name : null,
    basePrice: service.price || 0,
    lines,
    frozenAt: new Date(),
  };
}

module.exports = { buildPriceSnapshot };
