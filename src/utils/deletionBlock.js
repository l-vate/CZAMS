// Whether a customer can delete their account yet, for the profile page. The server decides (DELETE /api/auth/account answers 409 while a
// booking is Pending, Approved or In Progress); this only lets the page say so before the customer tries.
import { BOOKING_STATUS } from '../constants/bookingStatus.js';

const ACTIVE = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS];

// How many of these bookings are still active.
export function countActiveBookings(bookings) {
  return Array.isArray(bookings) ? bookings.filter((b) => ACTIVE.includes(b?.status)).length : 0;
}

// The line shown next to the disabled Delete Account button, or '' when nothing blocks it.
export function deletionBlockNote(activeCount) {
  if (!(activeCount > 0)) return '';
  const noun = activeCount === 1 ? 'active booking' : 'active bookings';
  return `You cannot delete your account while you have active bookings. You have ${activeCount} ${noun}. Complete or cancel ${activeCount === 1 ? 'it' : 'them'} first.`;
}
