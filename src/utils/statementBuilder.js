// Statement of Account for one customer: their bookings in a date range with what was billed, what
// was paid and what is still owed. Pure: the price of a booking comes in through `pricingOf` (see
// bookingMoney.js), so the figures can be tested on their own. Uses the same paid and refund rules
// as the Analytics page and the Cancelled Bookings report (salesFigures.js).
import { amountPaid, refundedAmount, inRange } from './salesFigures.js';

const peso = (n) => `₱${(Math.round(n) || 0).toLocaleString()}`;

// What a cancelled booking had been paid when it was cancelled: the refund request records it.
function paidAtCancellation(b, pricingOf) {
  if (b.refund && b.refund.status !== 'None' && typeof b.refund.downPaymentAmount === 'number') return b.refund.downPaymentAmount;
  return amountPaid(b, pricingOf);
}

function statusText(b, balance) {
  if (b.status === 'Cancelled') {
    if (b.refund?.status === 'Processed') return `Cancelled, ${peso(refundedAmount(b))} refunded`;
    if (b.refund?.status === 'Pending') return 'Cancelled, refund pending';
    return 'Cancelled';
  }
  if (balance === 0) return 'Fully paid';
  if (b.paymentStatus === 'partially_paid') return 'Partly paid';
  if (b.paymentStatus === 'to_verify') return 'Payment to verify';
  return 'Unpaid';
}

export const STATEMENT_COLUMNS = ['Date', 'Booking ID', 'Service', 'Total', 'Paid', 'Balance', 'Status'];

// `filters` = { fromKey, toKey, dateBasis }. Returns the rows as numbers (for checks) and as text.
export function buildStatement(customerId, bookings, filters, pricingOf) {
  const mine = bookings
    .filter((b) => b.customer?._id === customerId && !b.isBackJob && inRange(b, filters))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.bookingId).localeCompare(String(b.bookingId)));

  const lines = mine.map((b) => {
    const cancelled = b.status === 'Cancelled';
    const { total } = pricingOf(b);
    // Cancelled bookings are listed for reference but not billed. Their Paid is what the customer
    // is out of pocket after any processed refund.
    const paid = cancelled ? paidAtCancellation(b, pricingOf) - refundedAmount(b) : amountPaid(b, pricingOf);
    const balance = cancelled ? 0 : Math.max(0, total - paid);
    return { booking: b, cancelled, total: cancelled ? 0 : total, paid, balance, status: statusText(b, balance) };
  });

  const sum = (key) => lines.reduce((s, l) => s + l[key], 0);
  const totals = { total: sum('total'), paid: sum('paid'), balance: sum('balance') };

  return {
    lines,
    totals,
    outstanding: totals.balance,
    columns: STATEMENT_COLUMNS,
    rows: lines.map((l) => [
      l.booking.date || 'N/A',
      l.booking.bookingId,
      l.booking.service?.name || 'N/A',
      l.cancelled ? '-' : peso(l.total),
      peso(l.paid),
      l.cancelled ? '-' : peso(l.balance),
      l.status,
    ]),
    totalRow: ['Total', '', '', peso(totals.total), peso(totals.paid), peso(totals.balance), ''],
  };
}

export { peso as statementPeso };
