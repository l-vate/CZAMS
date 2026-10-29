// The "Needs attention" panel of the admin dashboard, worked out live from what is already stored. Pure functions: they read the bookings,
// back job claims and services they are given and return the groups; they change nothing and store nothing.
//
// Groups and kinds (constants/needsAttention.js):
//   today     bookings dated today or tomorrow (Manila) that still need action
//               today_pending      status Pending
//               today_unstaffed    status Approved with fewer technicians than the service needs (utils/assignments.js isStaffed)
//               today_proof        Pending or Approved with a down payment or balance proof still To Verify
//   decision  things only the owner can decide
//               pending_approval   status Pending (the ones already under "today" are not listed twice)
//               unit_confirmation  Pending with a unit the customer asked for that is not settled (units[].supplied.source requested, status Pending)
//               cannot_supply      Pending with an active "cannot supply this unit" notice (unitDecline.reason)
//               discount_review    Senior or PWD discount with status Pending on a Pending or Approved booking
//               back_job_review    back job claim still open with status Not Covered
//               extension_request  extensionRequest.status Pending
//               disruption_report  disruption.status Reported
//   money     payment_proof (paymentStatus or balancePaymentStatus To Verify) and refund_waiting (refund.status Pending)
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const { REFUND_STATUS } = require('../constants/refundStatus');
const { BACK_JOB_STATUS } = require('../constants/backJobStatus');
const {
  TODAY_WINDOW_DAYS, ITEMS_PER_GROUP, SOON_AFTER_WORKING_DAYS, GROUPS, GROUP_KEYS, URGENCY_RANK,
} = require('../constants/needsAttention');
const { manilaTodayKey } = require('./timeBlocks');
const { addDays } = require('./extensionDays');
const { isBusinessDay } = require('./businessDays');
const { isStaffed, getMinTechnicians } = require('./assignments');

const BOOKING_PATH = (bookingId) => `/admin/services/requests/${encodeURIComponent(bookingId)}`;
const PAYMENTS_PATH = (filter, bookingId) => `/admin/payments?filter=${filter}&q=${encodeURIComponent(bookingId)}`;

const toDate = (value) => (value ? new Date(value) : null);
const keyOf = (value) => (value ? manilaTodayKey(new Date(value)) : null);

// How many working days (Manila days that are not closed Sundays) lie after `fromKey`, up to and including `toKey`. 0 when the same day.
function workingDaysBetween(fromKey, toKey) {
  if (!fromKey || !toKey || fromKey >= toKey) return 0;
  let days = 0;
  let key = fromKey;
  for (let i = 0; i < 400 && key < toKey; i += 1) {
    key = addDays(key, 1);
    if (isBusinessDay(key)) days += 1;
  }
  return days;
}

// today: the booked date is today or earlier. soon: tomorrow, or it has been waiting at least the kind's number of working days. else waiting.
function urgencyOf(kind, { date, waitingDays }, todayKey) {
  if (date && date <= todayKey) return 'today';
  if (date && date <= addDays(todayKey, TODAY_WINDOW_DAYS) && date > todayKey) return 'soon';
  return waitingDays >= SOON_AFTER_WORKING_DAYS[kind] ? 'soon' : 'waiting';
}

const customerIdOf = (booking) => (booking.customer && typeof booking.customer === 'object' ? String(booking.customer._id) : String(booking.customer || ''));

function makeItem(kind, source, { label, waitingSince, link, customerId, bookingId, date }, now, todayKey) {
  const since = toDate(waitingSince) || toDate(source.createdAt) || now;
  const waitingDays = workingDaysBetween(keyOf(since), todayKey);
  return {
    id: `${kind}:${bookingId}`,
    kind,
    bookingId,
    customerId,
    label,
    date: date || null,
    waitingSince: since.toISOString(),
    waitingMinutes: Math.max(0, Math.round((now.getTime() - since.getTime()) / 60000)),
    waitingDays,
    urgency: urgencyOf(kind, { date, waitingDays }, todayKey),
    link,
  };
}

const supplied = (unit) => (unit && unit.supplied ? unit.supplied : null);
const hasOpenUnitRequest = (booking) => (booking.units || []).some((u) => supplied(u) && supplied(u).source === 'requested' && supplied(u).status === 'Pending');
const oldestUnitRequestAt = (booking) => (booking.units || [])
  .filter((u) => supplied(u) && supplied(u).source === 'requested' && supplied(u).status === 'Pending')
  .map((u) => toDate(supplied(u).chosenAt)).filter(Boolean).sort((a, b) => a - b)[0] || null;

// Every item of every kind that holds right now, unsorted and with no names yet. `servicesById` is a Map of the services the bookings use.
function collectItems({ bookings = [], backJobs = [], servicesById = new Map(), now = new Date() }) {
  const todayKey = manilaTodayKey(now);
  const tomorrowKey = addDays(todayKey, TODAY_WINDOW_DAYS);
  const items = [];

  for (const b of bookings) {
    const base = { bookingId: b.bookingId, customerId: customerIdOf(b), date: b.date || null };
    const add = (kind, extra) => items.push(makeItem(kind, b, { ...base, link: BOOKING_PATH(b.bookingId), ...extra }, now, todayKey));
    const pending = b.status === BOOKING_STATUS.PENDING;
    const approved = b.status === BOOKING_STATUS.APPROVED;
    const inWindow = Boolean(b.date) && b.date >= todayKey && b.date <= tomorrowKey;
    // a booking dated before today that is still Pending or Approved has missed its day and is as urgent as one dated today
    const dueNow = Boolean(b.date) && b.date <= tomorrowKey;
    const proofWaiting = b.paymentStatus === PAYMENT_STATUS.TO_VERIFY || b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY;
    const live = pending || approved;

    if (dueNow && pending) {
      add('today_pending', { label: `Waiting for approval, booked ${b.date === todayKey ? 'today' : b.date < todayKey ? 'on a past date' : 'tomorrow'}` });
    }
    if (dueNow && approved) {
      const service = servicesById.get(String(b.service)) || (b.service && typeof b.service === 'object' ? b.service : null);
      const assignments = b.assignments || [];
      if (!isStaffed(assignments, service)) {
        const need = getMinTechnicians(service);
        const assigned = new Set(assignments.flatMap((a) => (a && a.lead ? [String(a.lead), a.helper ? String(a.helper) : null] : [])).filter(Boolean)).size;
        add('today_unstaffed', { label: `Needs more technicians (${assigned} of ${need} assigned)` });
      }
    }
    if (dueNow && live && proofWaiting) {
      add('today_proof', { label: 'Payment proof not verified yet', link: PAYMENTS_PATH('to_verify', b.bookingId) });
    }

    if (pending) {
      if (!inWindow && !dueNow) add('pending_approval', { label: 'Waiting for approval' });
      if (hasOpenUnitRequest(b)) add('unit_confirmation', { label: 'Unit needs owner confirmation', waitingSince: oldestUnitRequestAt(b) });
      if (b.unitDecline && b.unitDecline.reason) {
        add('cannot_supply', { label: 'Cannot supply notice is active', waitingSince: b.unitDecline.declinedAt });
      }
    }
    if (live && b.discount && b.discount.status === 'Pending') {
      add('discount_review', { label: 'Senior or PWD discount to verify', waitingSince: b.discount.requestedAt });
    }
    if (b.extensionRequest && b.extensionRequest.status === 'Pending') {
      add('extension_request', { label: 'Technician asked for an extra day', waitingSince: b.extensionRequest.requestedAt });
    }
    if (b.disruption && b.disruption.status === 'Reported') {
      add('disruption_report', { label: 'Job disruption reported', waitingSince: b.disruption.reportedAt });
    }

    const downToVerify = b.paymentStatus === PAYMENT_STATUS.TO_VERIFY;
    const afterCancel = b.status === BOOKING_STATUS.CANCELLED;
    if (proofWaiting && (live || b.status === BOOKING_STATUS.IN_PROGRESS || (afterCancel && b.paymentCheckAfterCancel === true))) {
      add('payment_proof', {
        label: `${downToVerify ? 'Down payment' : 'Balance'} proof to verify${afterCancel ? ' (booking cancelled)' : ''}`,
        waitingSince: b.updatedAt,
        link: PAYMENTS_PATH('to_verify', b.bookingId),
      });
    }
    if (b.refund && b.refund.status === REFUND_STATUS.PENDING) {
      add('refund_waiting', {
        label: b.refund.paymentUnverified ? 'Refund asked for, payment not verified yet' : 'Refund waiting to be processed',
        waitingSince: b.refund.requestedAt,
        link: PAYMENTS_PATH('refund', b.bookingId),
      });
    }
  }

  for (const claim of backJobs) {
    if (claim.isOpen === false || claim.status !== BACK_JOB_STATUS.NOT_COVERED) continue;
    items.push(makeItem('back_job_review', claim, {
      bookingId: claim.originalBookingId,
      customerId: customerIdOf(claim),
      date: null,
      label: 'Back job claim to review',
      waitingSince: claim.reportedAt,
      link: '/admin/back-jobs?filter=Not%20Covered',
    }, now, todayKey));
  }
  return items;
}

// Most urgent first, then the earlier booked date (no date last), then the one waiting longest.
function compareItems(a, b) {
  if (URGENCY_RANK[a.urgency] !== URGENCY_RANK[b.urgency]) return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  if (a.date !== b.date) {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  }
  return new Date(a.waitingSince) - new Date(b.waitingSince);
}

const VIEW_ALL = Object.freeze({
  today: '/admin/services/requests?when=soon',
  decision: '/admin/services/requests?filter=Pending',
  money: '/admin/payments?filter=to_verify',
});

// The groups: every item sorted, with the full count. `limit` caps how many items each group keeps.
function buildGroups(input, limit = ITEMS_PER_GROUP) {
  const all = collectItems(input).sort(compareItems);
  const groups = {};
  for (const key of GROUP_KEYS) {
    const mine = all.filter((item) => GROUPS[key].includes(item.kind));
    groups[key] = { key, count: mine.length, items: mine.slice(0, limit), viewAll: VIEW_ALL[key] };
  }
  return groups;
}

// Puts the customer's name on each kept item ("Deleted customer" when the account is gone) and drops the internal customer id.
function withNames(groups, nameById) {
  const out = {};
  for (const key of GROUP_KEYS) {
    out[key] = {
      ...groups[key],
      items: groups[key].items.map(({ customerId, ...item }) => ({ ...item, customerName: nameById.get(customerId) || 'Deleted customer' })),
    };
  }
  return out;
}

const keptCustomerIds = (groups) => [...new Set(GROUP_KEYS.flatMap((key) => groups[key].items.map((item) => item.customerId)).filter(Boolean))];

module.exports = {
  collectItems, buildGroups, withNames, keptCustomerIds, compareItems, workingDaysBetween, urgencyOf, VIEW_ALL,
};
