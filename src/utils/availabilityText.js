// The words a customer sees for a date or a time block that cannot be booked, from the public availability answer
// (server/utils/availability.js). One place for the landing calendar and the booking date pickers, so they never disagree.
//   closed           "Closed: Holiday", "Closed: Sunday"
//   noTechnicians    "No technicians available"   (nobody can work in that block; the page is never told who is away or why)
//   fullyBooked      "Fully booked"               (technicians are there, every crew is taken)
export const NO_TECHNICIANS = 'No technicians available';
export const FULLY_BOOKED = 'Fully booked';

export const NO_TECHNICIANS_CODE = 'noTechnicians';

// "Closed: <reason>", never empty or undefined. A Sunday is "Closed: Sunday".
export function closedWords(reason) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  return `Closed: ${text || 'Shop closed'}`;
}

// What one block says: 'Available', or why it is not. A reply without reasons (an older server) reads as fully booked.
export function blockLabel(available, reason) {
  if (available) return 'Available';
  return reason === NO_TECHNICIANS_CODE ? NO_TECHNICIANS : FULLY_BOOKED;
}

// "Morning: Available · Afternoon: No technicians available"
export function blocksText(day) {
  return `Morning: ${blockLabel(day.morning, day.morningReason)} · Afternoon: ${blockLabel(day.afternoon, day.afternoonReason)}`;
}

// The closed words of a Sunday or of a date the shop closed.
export function closedDayText(day) {
  if (day.closedLabel) return day.closedLabel;
  return day.status === 'closed' ? closedWords('Sunday') : closedWords(day.reason);
}

// The one message for a day that is taken in both blocks: a single phrase when both blocks have the same reason, otherwise each block.
export function takenDayText(day) {
  const morning = blockLabel(day.morning, day.morningReason);
  const afternoon = blockLabel(day.afternoon, day.afternoonReason);
  return morning === afternoon ? morning : `Morning: ${morning} · Afternoon: ${afternoon}`;
}

// Whether a whole day is taken because no technician can work in either block (its own neutral look, not the red of fully booked).
export const isNoTechniciansDay = (day) => day?.status === 'full' && day.reasonCode === NO_TECHNICIANS_CODE;

// The class word for the look of a day: its status, except a day with no technicians.
export const dayLook = (day) => (isNoTechniciansDay(day) ? 'no-technicians' : day?.status || 'past');
