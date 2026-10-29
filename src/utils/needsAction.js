// The "Needs action" list of the admin's notifications page, made from the answer of
// GET /api/admin/needs-attention?all=1. Pure functions (no framework, so the tests load this file on its own): they read the answer and return
// rows; they change and store nothing. The server's rules for what needs action are not repeated here.
import { GROUP_KEYS, formatWaiting } from './needsAttention';

// More than this many items of one kind become one summary row ("15 payment proofs to verify, oldest 21 days").
export const ROLLUP_OVER = 3;

const URGENCY_RANK = Object.freeze({ today: 0, soon: 1, waiting: 2 });

// Per kind: the short title of the action, the small tag shown when a booking has this as an extra reason, and what the summary row says and opens.
// The order of the keys is the order a booking's main reason is picked in when two have the same urgency.
const KIND = Object.freeze({
  today_pending: { title: 'Approve booking', tag: 'Approval', many: 'bookings to approve', link: '/admin/services/requests?when=soon' },
  today_unstaffed: { title: 'Assign technicians', tag: 'Technicians', many: 'jobs that need technicians', link: '/admin/services/requests?when=soon' },
  today_proof: { title: 'Verify payment proof', tag: 'Payment proof', many: 'payment proofs to verify', link: '/admin/payments?filter=to_verify' },
  pending_approval: { title: 'Approve booking', tag: 'Approval', many: 'bookings to approve', link: '/admin/services/requests?filter=Pending' },
  unit_confirmation: { title: 'Confirm requested unit', tag: 'Unit', many: 'units to confirm', link: '/admin/services/requests?filter=Pending' },
  cannot_supply: { title: 'Cannot supply unit', tag: 'Unit notice', many: 'cannot supply notices', link: '/admin/services/requests?filter=Pending' },
  discount_review: { title: 'Verify discount', tag: 'Discount', many: 'discounts to verify', link: '/admin/services/requests' },
  back_job_review: { title: 'Review back job claim', tag: 'Back job', many: 'back job claims to review', link: '/admin/back-jobs?filter=Not%20Covered' },
  extension_request: { title: 'Decide on extra day', tag: 'Extra day', many: 'extra day requests', link: '/admin/services/requests' },
  disruption_report: { title: 'Review disruption', tag: 'Disruption', many: 'disruption reports', link: '/admin/services/requests' },
  payment_proof: { title: 'Verify payment proof', tag: 'Payment proof', many: 'payment proofs to verify', link: '/admin/payments?filter=to_verify' },
  refund_waiting: { title: 'Process refund', tag: 'Refund', many: 'refunds to process', link: '/admin/payments?filter=refund' },
});
const KIND_ORDER = Object.keys(KIND);

export const kindTitle = (kind) => KIND[kind]?.title || 'Needs action';

const allItems = (data) => (data && data.groups ? GROUP_KEYS.flatMap((key) => data.groups[key]?.items || []) : []);

const rank = (urgency) => (urgency in URGENCY_RANK ? URGENCY_RANK[urgency] : URGENCY_RANK.waiting);

// Most urgent first, then the earlier booked date (no date last), then the one waiting longest.
function compareRows(a, b) {
  if (rank(a.urgency) !== rank(b.urgency)) return rank(a.urgency) - rank(b.urgency);
  if (a.date !== b.date) {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  }
  return b.waitingMinutes - a.waitingMinutes;
}

// One row for one booking from all its items. The title is its most urgent reason; the other reasons become small tags.
function bookingRow(bookingId, items) {
  const sorted = [...items].sort((a, b) => rank(a.urgency) - rank(b.urgency) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const main = sorted[0];
  const tags = [...new Set(sorted.slice(1).map((item) => KIND[item.kind]?.tag).filter((tag) => tag && tag !== KIND[main.kind]?.tag))];
  const dates = items.map((item) => item.date).filter(Boolean).sort();
  // the booking page when there is one among the reasons, so a booking with a payment proof and a decision opens the booking, not the payments list
  const page = sorted.find((item) => String(item.link || '').startsWith('/admin/services/requests/')) || main;
  return {
    id: `booking:${bookingId}`,
    type: 'booking',
    bookingId,
    customerName: main.customerName || '',
    title: kindTitle(main.kind),
    tags,
    urgency: main.urgency,
    date: dates[0] || null,
    waitingMinutes: Math.max(...items.map((item) => item.waitingMinutes || 0)),
    link: page.link,
  };
}

function rollupRow(kind, items) {
  const oldest = Math.max(...items.map((item) => item.waitingMinutes || 0));
  return {
    id: `rollup:${kind}`,
    type: 'rollup',
    kind,
    count: items.length,
    text: `${items.length} ${KIND[kind]?.many || 'items need action'}, oldest ${formatWaiting(oldest)}`,
    waitingMinutes: oldest,
    link: KIND[kind]?.link || '/admin/services/requests',
  };
}

// { rows, bookingCount }. rows: one row per booking (reasons merged), most urgent first, then one summary row for each kind with more than
// ROLLUP_OVER items (the items of those kinds are not listed one by one). bookingCount is how many different bookings need action, rolled up or not.
export function buildNeedsActionRows(data) {
  const items = allItems(data);
  const byKind = new Map();
  for (const item of items) byKind.set(item.kind, [...(byKind.get(item.kind) || []), item]);
  const rolled = new Set([...byKind].filter(([, list]) => list.length > ROLLUP_OVER).map(([kind]) => kind));

  const byBooking = new Map();
  for (const item of items) {
    if (rolled.has(item.kind)) continue;
    byBooking.set(item.bookingId, [...(byBooking.get(item.bookingId) || []), item]);
  }
  const bookingRows = [...byBooking].map(([bookingId, list]) => bookingRow(bookingId, list)).sort(compareRows);
  const rollupRows = [...rolled]
    .map((kind) => rollupRow(kind, byKind.get(kind)))
    .sort((a, b) => b.count - a.count || b.waitingMinutes - a.waitingMinutes);

  return { rows: [...bookingRows, ...rollupRows], bookingCount: new Set(items.map((item) => item.bookingId)).size };
}

// The number on the Needs action tab: bookings that need action. 0 until there is an answer.
export const needsActionCount = (data) => buildNeedsActionRows(data).bookingCount;
