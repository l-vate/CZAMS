// Which promotion a booking gets. The same rules exist on the client in src/utils/promos.js;
// the server's answer is the one that is saved on the booking.
const { manilaTodayKey } = require('./timeBlocks');

// Pesos off a units subtotal. A fixed discount can never take off more than the subtotal.
function computeAmount(discountType, discountValue, grossSubtotal) {
  if (!(grossSubtotal > 0) || !(discountValue > 0)) return 0;
  if (discountType === 'percent') return Math.round(grossSubtotal * (Math.min(discountValue, 100) / 100));
  return Math.min(Math.round(discountValue), grossSubtotal);
}

// A promo is in force when it is switched on and today (Manila) is inside its dates, both ends included.
function isInForce(promo, today = manilaTodayKey()) {
  return !!promo.isActive && promo.startDate <= today && today <= promo.endDate;
}

// The promo's discount for an order, or 0 if it does not qualify: in force, the service is one
// it covers (an empty list covers everything), and enough units are ordered.
function promoAmount(promo, { serviceId, totalQuantity, grossSubtotal }, today) {
  if (!isInForce(promo, today)) return 0;
  const covers = !promo.services || promo.services.length === 0 || promo.services.map(String).includes(String(serviceId));
  if (!covers || totalQuantity < (promo.minUnits || 1)) return 0;
  return computeAmount(promo.discountType, promo.discountValue, grossSubtotal);
}

// When several promos qualify, the one that takes off the most. Ties go to the earliest created.
function pickBestPromo(promos, order, today) {
  let best = null;
  promos.forEach((promo) => {
    const amount = promoAmount(promo, order, today);
    if (amount > 0 && (!best || amount > best.amount)) best = { promo, amount };
  });
  return best;
}

module.exports = { computeAmount, isInForce, promoAmount, pickBestPromo };
