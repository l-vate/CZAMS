// Sales, payments collected and rating figures for the Analytics page and the reports. Pure: the
// price of a booking comes in through `pricingOf(booking) -> { total, downPayment, balance }`
// (see bookingMoney.js), so the rules here can be tested on their own.
//
// Definitions, shown to the admin under the cards:
//  - Sales = the final total (after any approved discount, with distance or mobilization charges,
//    VAT left out) of Completed bookings, free back-job visits excluded.
//  - Payments collected = what customers have actually paid and the admin has verified (the down
//    payment once accepted, plus the balance once settled), minus refunds already processed.
//  - Both count a booking by its service date or its date requested, never by the day money moved.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const VERIFIED_DOWN_PAYMENT = ['partially_paid', 'fully_paid', 'Paid'];

// "YYYY-MM-DD" of a stored date: a plain service date as is, a timestamp in the viewer's local day.
export function dateKeyOf(value) {
  if (!value) return null;
  if (DATE_KEY.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The date a booking is counted by: its service date, or the day it was requested.
export function countingDate(booking, dateBasis) {
  return dateKeyOf(dateBasis === 'requested' ? booking.createdAt : booking.date);
}

// A booking is in range when its counting date is between the two keys. A blank bound is open.
export function inRange(booking, { fromKey, toKey, dateBasis }) {
  const key = countingDate(booking, dateBasis);
  if (!key) return false;
  if (fromKey && key < fromKey) return false;
  if (toKey && key > toKey) return false;
  return true;
}

export const clientTypeOf = (booking) => booking.customer?.clientType || 'Residential';

export function matchesClientType(booking, clientType) {
  return !clientType || clientType === 'all' || clientTypeOf(booking) === clientType;
}

// What the customer has paid and the admin has verified, before any refund.
export function amountPaid(booking, pricingOf) {
  const downVerified = VERIFIED_DOWN_PAYMENT.includes(booking.paymentStatus)
    || booking.balancePaid || booking.balancePaymentStatus === 'paid';
  if (!downVerified) return 0;
  const { downPayment, balance } = pricingOf(booking);
  const balanceSettled = booking.balancePaid || booking.balancePaymentStatus === 'paid'
    || booking.paymentStatus === 'fully_paid' || booking.paymentStatus === 'Paid';
  return downPayment + (balanceSettled ? balance : 0);
}

// What has already been sent back: the final amount of a processed refund.
export function refundedAmount(booking) {
  if (booking.refund?.status !== 'Processed') return 0;
  return booking.refund.finalAmount ?? booking.refund.refundableAmount ?? 0;
}

// The month "YYYY-MM" of a counting date.
const monthOf = (key) => key.slice(0, 7);

function monthsBetween(firstKey, lastKey) {
  const months = [];
  let [y, m] = monthOf(firstKey).split('-').map(Number);
  const [ly, lm] = monthOf(lastKey).split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

export const monthLabel = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// `bookings` are already narrowed to the client type. `filters` = { fromKey, toKey, dateBasis }.
export function salesFigures(bookings, filters, pricingOf) {
  const scoped = bookings.filter((b) => !b.isBackJob && inRange(b, filters));
  const completed = scoped.filter((b) => b.status === 'Completed');

  const sales = completed.reduce((sum, b) => sum + pricingOf(b).total, 0);
  const paidGross = scoped.reduce((sum, b) => sum + amountPaid(b, pricingOf), 0);
  const refunded = scoped.reduce((sum, b) => sum + refundedAmount(b), 0);

  // Sales per month: every month from the first to the last one in the range (or in the data
  // when a bound is open), so a month with no sales shows as zero.
  const salesByMonth = new Map();
  completed.forEach((b) => {
    const month = monthOf(countingDate(b, filters.dateBasis));
    salesByMonth.set(month, (salesByMonth.get(month) || 0) + pricingOf(b).total);
  });
  const first = filters.fromKey || [...salesByMonth.keys()].sort()[0];
  const last = filters.toKey || [...salesByMonth.keys()].sort().pop();
  const perMonth = first && last
    ? monthsBetween(first, last).map((month) => ({ key: month, label: monthLabel(month), value: salesByMonth.get(month) || 0 }))
    : [];

  return {
    sales,
    completedCount: completed.length,
    collected: paidGross - refunded,
    paidGross,
    refunded,
    perMonth,
  };
}

// Average rating per technician. A rating counts for every technician on the job, the lead and
// the helper alike (the same rule as the rest of Analytics). `membersOf(booking)` -> [{ _id, name }].
export function technicianRatings(bookings, membersOf) {
  const map = new Map();
  bookings.forEach((b) => {
    if (typeof b.feedback?.rating !== 'number') return;
    membersOf(b).forEach((tech) => {
      const row = map.get(tech._id) || { id: tech._id, name: tech.name || 'Unknown', total: 0, ratings: 0 };
      row.total += b.feedback.rating;
      row.ratings += 1;
      map.set(tech._id, row);
    });
  });
  return map;
}

export const MIN_RATINGS_FOR_TOP = 3;

// The best average among technicians with enough ratings, or null. Ties: more ratings, then name.
export function topRatedTechnician(ratingRows, minRatings = MIN_RATINGS_FOR_TOP) {
  const eligible = [...ratingRows.values()]
    .filter((r) => r.ratings >= minRatings)
    .map((r) => ({ ...r, average: r.total / r.ratings }));
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b.average - a.average || b.ratings - a.ratings || a.name.localeCompare(b.name));
  return eligible[0];
}
