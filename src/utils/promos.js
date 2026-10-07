// Promotional packages, client side. The same rules as server/utils/promos.js: the server's
// answer is the one saved on a booking, this copy only lets the booking forms preview it.
import { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';

// Today's date in Philippine time as YYYY-MM-DD (what promo start and end dates are compared against).
export function manilaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// Pesos off a units subtotal. A fixed discount never takes off more than the subtotal.
export function computeAmount(discountType, discountValue, grossSubtotal) {
  if (!(grossSubtotal > 0) || !(discountValue > 0)) return 0;
  if (discountType === 'percent') return Math.round(grossSubtotal * (Math.min(discountValue, 100) / 100));
  return Math.min(Math.round(discountValue), grossSubtotal);
}

export function isInForce(promo, today = manilaToday()) {
  return !!promo.isActive && promo.startDate <= today && today <= promo.endDate;
}

export function promoAmount(promo, { serviceId, totalQuantity, grossSubtotal }, today) {
  if (!isInForce(promo, today)) return 0;
  const covers = !promo.services || promo.services.length === 0 || promo.services.map(String).includes(String(serviceId));
  if (!covers || totalQuantity < (promo.minUnits || 1)) return 0;
  return computeAmount(promo.discountType, promo.discountValue, grossSubtotal);
}

// The qualifying promo that takes off the most, as { promo, amount }, or null.
export function pickBestPromo(promos, order, today) {
  let best = null;
  (promos || []).forEach((promo) => {
    const amount = promoAmount(promo, order, today);
    if (amount > 0 && (!best || amount > best.amount)) best = { promo, amount };
  });
  return best;
}

// "10% off" or "₱500 off"
export function describeDiscount(promo) {
  return promo.discountType === 'percent' ? `${promo.discountValue}% off` : `₱${Number(promo.discountValue).toLocaleString()} off`;
}

// The promos in force today, from the public endpoint (no login needed).
export function usePublicPromos() {
  const [promos, setPromos] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/promos/public`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setPromos(Array.isArray(data) ? data : []))
      .catch(() => setPromos([]))
      .finally(() => setLoaded(true));
  }, []);

  return { promos, loaded };
}
