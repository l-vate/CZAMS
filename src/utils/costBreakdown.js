import { getUnitPrice } from './bookingPricing';
import { pickBestPromo } from './promos';
import { equipmentLines } from './suppliedUnitChoice';

// Shared cost breakdown math, used by Step2 (per-row price preview), Step4,
// and Step5. Itemizes each unit entry (type × quantity, at that type's price)
// instead of assuming one flat price for the whole booking.
export function getCostBreakdown(form, services, defaultDownPaymentPercent, discountPercent = 0, promos = []) {
  const selected = services.find((s) => s.id === form.service);
  const units = form.units || [];

  const lineItems = units.map((u) => {
    const unitPrice = getUnitPrice(selected, u.type);
    return { ...u, unitPrice, subtotal: unitPrice * (u.quantity || 0) };
  });

  const grossPrice = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
  // Senior/PWD discount comes off the units subtotal before the down payment is worked
  // out. It is only passed a percent when it applies right now (an admin walk-in);
  // a customer's request stays pending, so their totals are not discounted yet.
  const seniorAmount = form.discountType ? Math.round(grossPrice * ((discountPercent || 0) / 100)) : 0;
  // A qualifying promo is applied automatically. It and a Senior/PWD discount do not stack:
  // whichever takes off more is used.
  const bestPromo = pickBestPromo(promos, {
    serviceId: form.service,
    totalQuantity: units.reduce((sum, u) => sum + (u.quantity || 0), 0),
    grossSubtotal: grossPrice,
  });
  const promoAmount = bestPromo ? bestPromo.amount : 0;
  const useSenior = seniorAmount > promoAmount;
  const discountAmount = useSenior ? seniorAmount : promoAmount;
  const discountLabel = discountAmount === 0 ? '' : (useSenior ? 'Senior/PWD Discount' : `Promo: ${bestPromo.promo.name}`);
  // What the down payment works off: the units less the discount. The unit the customer buys from the company (its catalog price times the
  // quantity) is added to the total afterwards, so it falls into the remaining balance, like the server does (server/utils/pricing.js).
  const unitsSubtotal = grossPrice - discountAmount;
  const equipment = equipmentLines(units);
  const equipmentTotal = equipment.reduce((sum, line) => sum + line.subtotal, 0);
  const basePrice = unitsSubtotal + equipmentTotal;
  // No percent yet (settings not loaded) means no down payment figure, never a guessed one.
  const dpPercent = form.downPaymentPercent ?? defaultDownPaymentPercent ?? null;
  const toPayNow = dpPercent === null ? 0 : Math.round(unitsSubtotal * (dpPercent / 100));
  const remaining = basePrice - toPayNow;
  const isFullPay = dpPercent === 100;
  return { selected, lineItems, equipment, equipmentTotal, basePrice, grossPrice, discountAmount, discountLabel, dpPercent, toPayNow, remaining, isFullPay };
}
