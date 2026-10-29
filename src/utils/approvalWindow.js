// Mirrors server/utils/bookingLifecycle.js (isPastApproval): a Pending booking whose booked day has started can no longer be approved, and the
// day start job cancels it. An urgent booking made on or after the start of its own booked day stays approvable during that day. Change
// PENDING_EXPIRY_GRACE_DAYS here together with server/constants/bookingLifecycle.js.
import { manilaDateKey, manilaTodayKey, addDaysToKey } from './manilaTime';

export const PENDING_EXPIRY_GRACE_DAYS = 0;
export const APPROVAL_TOO_LATE = 'This booking can no longer be approved because its service day has started.';

export function isPastApproval(booking, now = new Date()) {
  if (!booking || booking.status !== 'Pending' || !booking.date) return false;
  const lastDay = addDaysToKey(booking.date, PENDING_EXPIRY_GRACE_DAYS);
  const today = manilaTodayKey(now);
  const onItsOwnDay = Boolean(booking.createdAt) && manilaDateKey(booking.createdAt) >= booking.date;
  return onItsOwnDay ? lastDay < today : lastDay <= today;
}
