// How the app prices a saved booking, in the shape salesFigures.js and the statements expect.
import { getPaymentBreakdown } from './bookingPricing';

export function pricingOf(booking) {
  const { total, grandTotal, downPayment, balance } = getPaymentBreakdown(booking);
  return { total, grandTotal, downPayment, balance };
}
