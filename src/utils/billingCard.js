// What a bill card on the customer Billing page shows, as pure helpers (no app imports, so they are tested on their own).
import { customerPaymentStatus } from './customerPayment.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The status badge's colour family. One key per state, each with its own colours (customer.css, .billing-badge--*), none of them the primary blue.
//   unpaid (grey), verify (blue-grey), partial (amber), paid (green), rejected (red), refunded (purple), cancelled (grey), backjob (green)
export function billBadgeKey(bill) {
  if (bill.isBackJob) return 'backjob';
  if (bill.isRefunded) return 'refunded';
  if (bill.isCancelled) return 'cancelled';
  const { key } = customerPaymentStatus(bill.raw || {});
  return { fully_paid: 'paid', to_verify: 'verify', rejected: 'rejected', down_verified: 'partial', unpaid: 'unpaid' }[key] || 'unpaid';
}

// "Oct 25, 2026" from the stored service date "2026-10-25" (read as written, never shifted by a time zone)
export function formatBookedDate(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateKey || ''));
  if (!m) return String(dateKey || '-');
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// "Oct 22" from the moment the booking was created
export function formatCreatedDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// "₱3,500.00": always two decimals
export const peso2 = (amount) => `₱${(Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
