// The wording on a booking card in the admin Bookings list: the two dates labeled in one format, and a short technicians summary. Plain
// functions only, so the wording can be tested without a browser.
import { manilaDateKey } from './manilaTime';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-03" as "Nov 3, 2026"; a year is always shown for the booked date.
function dayText(key, withYear) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return null;
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

// The booked (service) date, a plain Manila calendar day: "Booked for Nov 3, 2026".
export function bookedForText(dateKey) {
  const text = dayText(dateKey, true);
  return text ? `Booked for ${text}` : 'Booked date not set';
}

// The day the request was made, in Manila time: "Created Oct 28" (the year only when it is not this year).
export function createdText(createdAt, now = new Date()) {
  if (!createdAt) return 'Created date unknown';
  const key = manilaDateKey(createdAt);
  const text = dayText(key, key.slice(0, 4) !== manilaDateKey(now).slice(0, 4));
  return text ? `Created ${text}` : 'Created date unknown';
}

// { count: "2 technicians", names: "Ana Cruz, Ben Reyes" } for the members on a booking (the names go in muted text).
export function techniciansSummary(members, needsReassignment = false) {
  const list = Array.isArray(members) ? members : [];
  const names = list.map((m) => m?.name || m?.fullName || '').filter(Boolean).join(', ');
  const count = list.length === 0 ? 'No technician assigned' : `${list.length} technician${list.length === 1 ? '' : 's'}`;
  return { count, names, needsNew: Boolean(needsReassignment) };
}

// How many bookings each status chip would show (All plus one per status).
export function statusCounts(bookings, statuses) {
  const counts = { All: Array.isArray(bookings) ? bookings.length : 0 };
  statuses.forEach((s) => { counts[s] = 0; });
  (Array.isArray(bookings) ? bookings : []).forEach((b) => { if (b && counts[b.status] !== undefined) counts[b.status] += 1; });
  return counts;
}
