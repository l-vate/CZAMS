// Builds the content of each admin report from the raw API data.
//
// Every builder returns the same shape, which components/report_sheet.jsx renders and
// prints:
//   { title, summary: [{ label, value }], charts: [{ kind, title, ... }],
//     columns: [...], rows: [[...]], totalRow?: [...], notes: [...] }
//
// Dates: all range checks compare LOCAL calendar-day keys (toLocalDateKey), never
// toISOString(), which converts to UTC and puts a Manila date after 00:00 on the wrong day.
import { getBookingLineItems } from './bookingPricing';
import { pricingOf } from './bookingMoney';
import { amountPaid, refundedAmount } from './salesFigures';
import { toLocalDateKey } from './date';
import { getMembers } from './assignments';
import { getRequestsPerMonth, getBookingsByStatus, getCompletedPerTechnician } from './chartData';
import { BOOKING_STATUS } from '../constants/bookingStatus';
import { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } from '../constants/paymentStatus';
import { REFUND_STATUS } from '../constants/refundStatus';
import { BACK_JOB_STATUS } from '../constants/backJobStatus';

export const REPORT_TYPES = [
  { key: 'requests', label: 'Service Requests Summary' },
  { key: 'technicians', label: 'Technician Performance' },
  { key: 'customers', label: 'Customer Summary' },
  { key: 'payments', label: 'Payments Summary' },
  { key: 'backjobs', label: 'Back Jobs and Warranty Claims' },
  { key: 'cancelled', label: 'Cancelled Bookings' },
];

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDay(dateOrIso) {
  if (!dateOrIso) return 'N/A';
  return new Date(dateOrIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatKey(key) {
  return keyToDate(key).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatRange(fromKey, toKey) {
  return `${formatKey(fromKey)} to ${formatKey(toKey)}`;
}

// The generated stamp is always shown in Philippine time, whatever the viewer's computer is set to.
export function formatGeneratedAt(date = new Date()) {
  const text = date.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return `${text} (Asia/Manila)`;
}

const peso = (n) => `₱${(Math.round(n) || 0).toLocaleString()}`;
const average = (nums) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null);
const hours = (n) => (n === null ? 'N/A' : `${n.toFixed(1)} hrs`);
const clientOf = (customer) => customer?.clientType || 'Residential';

// Which date a report counts bookings by: when they were requested, or the day of the service.
export const DATE_BASES = [
  { key: 'service', label: 'Service date' },
  { key: 'requested', label: 'Date requested' },
];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const bookingDate = (b, filters) => (filters.dateBasis === 'requested' ? b.createdAt : b.date);
// A back-job claim: the day it was filed, or the day of the service it is about.
const claimDate = (bj, filters) => (filters.dateBasis === 'requested' ? bj.reportedAt : bj.originalBooking?.date);
const basisNote = (filters, what = 'Bookings') => `${what} are counted by their ${filters.dateBasis === 'requested' ? 'date requested' : 'service date'}.`;

function inRange(value, { fromKey, toKey }) {
  if (!value) return false;
  const key = DATE_KEY.test(value) ? value : toLocalDateKey(new Date(value));
  return key >= fromKey && key <= toKey;
}

function matchesClient(clientType, filters) {
  return filters.clientType === 'all' || clientType === filters.clientType;
}

// Bookings inside the date range (by the chosen date basis), for the chosen client type.
function scopeBookings(bookings, filters) {
  return bookings.filter(
    (b) => inRange(bookingDate(b, filters), filters) && matchesClient(clientOf(b.customer), filters)
  );
}

const rangeOf = (filters) => ({ from: keyToDate(filters.fromKey), to: keyToDate(filters.toKey), dateOf: (b) => bookingDate(b, filters) });

const BACK_JOB_NOTE = 'Free back-job repair visits are not counted as new requests. See the Back Jobs and Warranty Claims report.';

// ---------------------------------------------------------------------------
export function buildServiceRequestsReport(data, filters) {
  const scoped = scopeBookings(data.bookings, filters);
  const requests = scoped.filter((b) => !b.isBackJob);
  const count = (status) => requests.filter((b) => b.status === status).length;
  const completed = count('Completed');
  const responseHours = requests
    .filter((b) => b.approvedAt && b.createdAt)
    .map((b) => (new Date(b.approvedAt) - new Date(b.createdAt)) / 3600000);
  const perMonth = getRequestsPerMonth(requests, rangeOf(filters));

  return {
    title: 'Service Requests Summary',
    summary: [
      { label: 'Total Requests', value: requests.length },
      { label: 'Pending', value: count('Pending') },
      { label: 'Approved', value: count('Approved') },
      { label: 'In Progress', value: count('In Progress') },
      { label: 'Completed', value: completed },
      { label: 'Cancelled', value: count('Cancelled') },
      { label: 'Completion Rate', value: requests.length ? `${Math.round((completed / requests.length) * 100)}%` : 'N/A' },
      { label: 'Average Response Time', value: hours(average(responseHours)) },
    ],
    charts: [
      { kind: 'bar', title: 'Service Requests per Month', data: perMonth.data, xLabel: perMonth.xLabel, yLabel: 'Requests' },
      { kind: 'donut', title: 'Requests by Status', data: getBookingsByStatus(requests), centerLabel: 'Requests' },
    ],
    columns: ['Booking ID', 'Requested', 'Customer', 'Client Type', 'Service', 'Units', 'Service Date', 'Status'],
    rows: [...requests]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((b) => {
        const units = (b.units || []).map((u) => `${u.quantity}x ${u.type}`).join(', ') || 'N/A';
        return [b.bookingId, formatDay(b.createdAt), b.customer?.name || 'N/A', clientOf(b.customer), b.service?.name || 'N/A', units, b.date || 'N/A', b.status];
      }),
    notes: [
      basisNote(filters),
      'Response time is the time from the request being made to an admin approving it. Requests not yet approved are left out of the average.',
      scoped.length !== requests.length ? BACK_JOB_NOTE : null,
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
export function buildTechnicianReport(data, filters) {
  const requests = scopeBookings(data.bookings, filters).filter((b) => !b.isBackJob);
  const completedIds = new Set(requests.filter((b) => b.status === BOOKING_STATUS.COMPLETED).map((b) => b.bookingId));

  const people = new Map();
  data.technicians.forEach((t) => people.set(t._id, t.name || 'Unknown'));
  requests.forEach((b) => getMembers(b).forEach((m) => people.set(m._id, m.name || 'Unknown')));

  const rows = [...people.entries()].map(([id, name]) => {
    // A job counts for every technician on it, lead and helper alike.
    const mine = requests.filter((b) => getMembers(b).some((m) => m._id === id));
    const done = mine.filter((b) => b.status === BOOKING_STATUS.COMPLETED);
    const labor = data.reports
      .filter((r) => completedIds.has(r.bookingId) && done.some((b) => b.bookingId === r.bookingId) && typeof r.laborHours === 'number')
      .map((r) => r.laborHours);
    const delays = mine.filter((b) => (b.disruption?.status && b.disruption.status !== 'None') || b.extensionRequest?.status === 'Approved').length;
    const ratings = done.map((b) => b.feedback?.rating).filter((n) => typeof n === 'number');
    return { name, assigned: mine.length, completed: done.length, labor, delays, ratings };
  }).sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));

  const allLabor = rows.flatMap((r) => r.labor);
  return {
    title: 'Technician Performance',
    summary: [
      { label: 'Technicians', value: rows.length },
      { label: 'Assigned Bookings', value: rows.reduce((s, r) => s + r.assigned, 0) },
      { label: 'Completed Jobs', value: rows.reduce((s, r) => s + r.completed, 0) },
      { label: 'Average Service Time', value: hours(average(allLabor)) },
      { label: 'Delays', value: rows.reduce((s, r) => s + r.delays, 0) },
    ],
    charts: [
      { kind: 'hbar', title: 'Completed Jobs per Technician', data: getCompletedPerTechnician(requests), xLabel: 'Completed jobs' },
    ],
    columns: ['Technician', 'Assigned', 'Completed', 'Average Service Time', 'Delays', 'Average Rating'],
    rows: rows.map((r) => [
      r.name, r.assigned, r.completed, hours(average(r.labor)), r.delays,
      r.ratings.length ? `${average(r.ratings).toFixed(1)} / 5` : 'N/A',
    ]),
    notes: [
      basisNote(filters),
      'A job counts for every technician on it, the lead and the helper alike, so the rows add up to more than the number of jobs.',
      'Average service time is the labor hours the lead technician entered on the service report, credited to each technician on the job.',
      'A delay is a booking with a reported disruption or an approved extension request.',
      requests.length !== scopeBookings(data.bookings, filters).length ? BACK_JOB_NOTE : null,
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
export function buildCustomerReport(data, filters) {
  const requests = scopeBookings(data.bookings, filters).filter((b) => !b.isBackJob);
  const customers = data.customers.filter((c) => matchesClient(clientOf(c), filters));

  const rows = customers.map((c) => {
    const mine = requests.filter((b) => b.customer?._id === c._id);
    const last = mine.reduce((latest, b) => { const d = bookingDate(b, filters); return !latest || d > latest ? d : latest; }, null);
    return {
      customer: c,
      bookings: mine.length,
      completed: mine.filter((b) => b.status === BOOKING_STATUS.COMPLETED).length,
      cancelled: mine.filter((b) => b.status === BOOKING_STATUS.CANCELLED).length,
      last,
      isNew: inRange(c.createdAt, filters),
    };
  }).filter((r) => r.bookings > 0 || r.isNew)
    .sort((a, b) => b.bookings - a.bookings || (a.customer.name || '').localeCompare(b.customer.name || ''));

  const active = rows.filter((r) => r.bookings > 0);
  const ratings = requests.map((b) => b.feedback?.rating).filter((n) => typeof n === 'number');
  const perMonth = getRequestsPerMonth(requests, rangeOf(filters));

  return {
    title: 'Customer Summary',
    summary: [
      { label: 'Customers With Bookings', value: active.length },
      { label: 'New Customers', value: rows.filter((r) => r.isNew).length },
      { label: 'Return Customers (active)', value: active.filter((r) => r.customer.classification === 'Return').length },
      { label: 'Total Bookings', value: requests.length },
      { label: 'Completed Bookings', value: requests.filter((b) => b.status === BOOKING_STATUS.COMPLETED).length },
      { label: 'Average Rating Given', value: ratings.length ? `${average(ratings).toFixed(1)} / 5` : 'N/A' },
    ],
    charts: [
      { kind: 'bar', title: 'Bookings per Month', data: perMonth.data, xLabel: perMonth.xLabel, yLabel: 'Bookings' },
      { kind: 'donut', title: 'Bookings by Status', data: getBookingsByStatus(requests), centerLabel: 'Bookings' },
    ],
    columns: ['Customer', 'Email', 'Client Type', 'Classification', 'Registered', 'Bookings', 'Completed', 'Cancelled', 'Last Booking'],
    rows: rows.map((r) => [
      r.customer.name || 'N/A', r.customer.email || 'N/A', clientOf(r.customer), r.customer.classification || 'Regular',
      formatDay(r.customer.createdAt), r.bookings, r.completed, r.cancelled, r.last ? (DATE_KEY.test(r.last) ? formatDay(keyToDate(r.last)) : formatDay(r.last)) : 'None',
    ]),
    notes: [
      basisNote(filters),
      'Lists customers with at least one booking in the period, or who registered in it. Classification is as of today.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Same grouping as the admin Payments page, so the two always agree.
export const PAYMENT_GROUPS = [
  { key: 'unpaid', label: 'Unpaid', color: 'var(--danger)' },
  { key: 'to_verify', label: 'To Verify', color: 'var(--warning)' },
  { key: 'partially_paid', label: 'Partially Paid', color: 'var(--status-progress-solid)' },
  { key: 'fully_paid', label: 'Fully Paid', color: 'var(--success)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--danger-hover)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--payment-cancelled-txt)' },
  { key: 'cancelled_refund_pending', label: 'Cancelled, Refund Pending', color: 'var(--primary)' },
  { key: 'refunded', label: 'Refunded', color: 'var(--payment-refunded-txt)' },
];

export function getPaymentGroup(b) {
  if (b.refund?.status === REFUND_STATUS.PROCESSED) return 'refunded';
  if (b.status === BOOKING_STATUS.CANCELLED) return b.refund?.status === REFUND_STATUS.PENDING ? 'cancelled_refund_pending' : 'cancelled';
  if (b.paymentStatus === PAYMENT_STATUS.REJECTED) return 'rejected';
  if (b.paymentStatus === PAYMENT_STATUS.FULLY_PAID || b.balancePaid || b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.PAID) return 'fully_paid';
  if (b.paymentStatus === PAYMENT_STATUS.PARTIALLY_PAID) {
    if (b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.REJECTED) return 'rejected';
    return b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY ? 'to_verify' : 'partially_paid';
  }
  if (b.paymentStatus === PAYMENT_STATUS.TO_VERIFY) return 'to_verify';
  return 'unpaid';
}

export function buildPaymentsReport(data, filters) {
  const scoped = scopeBookings(data.bookings, filters);
  const billable = scoped.filter((b) => !b.isBackJob);

  const groups = PAYMENT_GROUPS.map((g) => {
    const members = billable.filter((b) => getPaymentGroup(b) === g.key);
    const total = members.reduce((s, b) => s + getBookingLineItems(b).basePrice, 0);
    const vat = members.reduce((s, b) => s + (b.vatAmount || 0), 0);
    return { ...g, count: members.length, total, vat };
  });
  const sum = (field) => groups.reduce((s, g) => s + g[field], 0);
  const perMonth = getRequestsPerMonth(billable, rangeOf(filters));

  return {
    title: 'Payments Summary',
    summary: [
      { label: 'Bookings', value: billable.length },
      { label: 'Fully Paid', value: groups.find((g) => g.key === 'fully_paid').count },
      { label: 'Awaiting Verification', value: groups.find((g) => g.key === 'to_verify').count },
      { label: 'Unpaid', value: groups.find((g) => g.key === 'unpaid').count },
      { label: 'Refund Requests Pending', value: groups.find((g) => g.key === 'cancelled_refund_pending').count },
      { label: 'Total Price of Bookings', value: peso(sum('total')) },
    ],
    charts: [
      { kind: 'bar', title: 'Bookings per Month', data: perMonth.data, xLabel: perMonth.xLabel, yLabel: 'Bookings' },
      { kind: 'donut', title: 'Bookings by Payment Status', data: groups.map((g) => ({ label: g.label, value: g.count, color: g.color })), centerLabel: 'Bookings' },
    ],
    columns: ['Payment Status', 'Bookings', 'Total Price', 'VAT', 'Total incl. VAT'],
    rows: groups.map((g) => [g.label, g.count, peso(g.total), peso(g.vat), peso(g.total + g.vat)]),
    totalRow: ['Total', sum('count'), peso(sum('total')), peso(sum('vat')), peso(sum('total') + sum('vat'))],
    notes: [
      basisNote(filters),
      'A billing status summary only. It counts bookings by their payment status and adds up their listed prices; it is not an accounting record.',
      'Total Price is after any approved Senior/PWD discount and includes distance or mobilization charges. VAT applies to commercial clients only.',
      scoped.length !== billable.length ? 'Free back-job repair visits have nothing to pay and are not included.' : null,
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
export function buildBackJobsReport(data, filters) {
  const clientById = new Map(data.customers.map((c) => [c._id, clientOf(c)]));
  const claims = data.backJobs.filter(
    (bj) => inRange(claimDate(bj, filters), filters) && matchesClient(clientById.get(bj.customer?._id) || 'Residential', filters)
  );
  const within = claims.filter((bj) => bj.warrantyCheck?.withinWarranty === true).length;
  const notCovered = claims.filter((bj) => bj.warrantyCheck?.withinWarranty === false).length;
  const perMonth = getRequestsPerMonth(claims.map((bj) => ({ createdAt: claimDate(bj, filters) })), { ...rangeOf(filters), dateOf: (x) => x.createdAt });

  return {
    title: 'Back Jobs and Warranty Claims',
    summary: [
      { label: 'Claims Filed', value: claims.length },
      { label: 'Within Warranty', value: within },
      { label: 'Not Covered', value: notCovered },
      { label: 'Reviewed by Admin', value: claims.filter((bj) => bj.status === BACK_JOB_STATUS.REVIEWED).length },
      { label: 'Free Visits Scheduled', value: claims.filter((bj) => bj.status === BACK_JOB_STATUS.SCHEDULED).length },
      { label: 'Pre-existing Issue Flagged', value: claims.filter((bj) => bj.originalReportPreExistingIssue?.flagged).length },
    ],
    charts: [
      { kind: 'bar', title: 'Claims per Month', data: perMonth.data, xLabel: perMonth.xLabel, yLabel: 'Claims' },
      {
        kind: 'donut', title: 'Warranty Coverage', centerLabel: 'Claims',
        data: [
          { label: 'Within warranty', value: within, color: 'var(--success)' },
          { label: 'Not covered', value: notCovered, color: 'var(--danger)' },
        ],
      },
    ],
    columns: ['Claim ID', 'Reported', 'Customer', 'Client Type', 'Original Booking', 'Service', 'Coverage', 'Status', 'Free Visit', 'Issue'],
    rows: [...claims]
      .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))
      .map((bj) => [
        bj.backJobId, formatDay(bj.reportedAt), bj.customer?.name || 'N/A', clientById.get(bj.customer?._id) || 'Residential',
        bj.originalBookingId, bj.originalBooking?.service?.name || 'N/A',
        bj.warrantyCheck?.withinWarranty ? (bj.warrantyCheck.coverageType || 'Within warranty') : 'Not covered',
        bj.status, bj.resultingBookingId || 'None', bj.issueDescription || '',
      ]),
    notes: [
      `Claims are counted by ${filters.dateBasis === 'requested' ? 'the date the claim was filed' : 'the date of the original service'}.`,
      'Coverage is the warranty check made when the claim was filed.',
    ],
  };
}

// ---------------------------------------------------------------------------
const NOT_RECORDED = 'Not recorded';
const CANCELLED_BY_LABEL = { customer: 'Customer', admin: 'Admin' };

// What the customer had paid when the booking was cancelled: the refund's snapshot when a refund was
// opened (that is the amount the refund is worked out from), otherwise the verified payments.
export function cancelledAmountPaid(b) {
  if (b.refund && b.refund.status !== REFUND_STATUS.NONE && typeof b.refund.downPaymentAmount === 'number') return b.refund.downPaymentAmount;
  return amountPaid(b, pricingOf);
}

export function buildCancelledReport(data, filters) {
  const scoped = scopeBookings(data.bookings, filters);
  const cancelled = scoped
    .filter((b) => b.status === BOOKING_STATUS.CANCELLED && !b.isBackJob)
    .sort((a, b) => String(bookingDate(a, filters)).localeCompare(String(bookingDate(b, filters))));

  const cancelledOn = (b) => b.cancelledAt || b.refund?.requestedAt || null;
  const who = (b) => CANCELLED_BY_LABEL[b.cancelledBy] || NOT_RECORDED;
  const paid = cancelled.map(cancelledAmountPaid);
  const totalPaid = paid.reduce((s, n) => s + n, 0);
  const totalRefunded = cancelled.reduce((s, b) => s + refundedAmount(b), 0);
  const countWho = (label) => cancelled.filter((b) => who(b) === label).length;
  const perMonth = getRequestsPerMonth(cancelled, rangeOf(filters));

  return {
    title: 'Cancelled Bookings',
    summary: [
      { label: 'Cancelled Bookings', value: cancelled.length },
      { label: 'Cancelled by Customer', value: countWho('Customer') },
      { label: 'Cancelled by Admin', value: countWho('Admin') },
      { label: 'Total Paid', value: peso(totalPaid) },
      { label: 'Total Refunded', value: peso(totalRefunded) },
      { label: 'Refunds Pending', value: cancelled.filter((b) => b.refund?.status === REFUND_STATUS.PENDING).length },
    ],
    charts: [
      { kind: 'bar', title: 'Cancelled Bookings per Month', data: perMonth.data, xLabel: perMonth.xLabel, yLabel: 'Bookings' },
      {
        kind: 'donut', title: 'Who Cancelled', centerLabel: 'Bookings',
        data: [
          { label: 'Customer', value: countWho('Customer'), color: 'var(--primary)' },
          { label: 'Admin', value: countWho('Admin'), color: 'var(--warning)' },
          { label: NOT_RECORDED, value: countWho(NOT_RECORDED), color: 'var(--ink-soft)' },
        ],
      },
    ],
    columns: ['Booking ID', 'Customer', 'Client Type', 'Service', 'Service Date', 'Cancelled On', 'Cancelled By', 'Amount Paid', 'Refund Final Amount', 'Refund Status'],
    rows: cancelled.map((b, i) => [
      b.bookingId,
      b.customer?.name || 'N/A',
      clientOf(b.customer),
      b.service?.name || 'N/A',
      b.date || 'N/A',
      cancelledOn(b) ? formatDay(cancelledOn(b)) : NOT_RECORDED,
      who(b),
      peso(paid[i]),
      b.refund?.status === REFUND_STATUS.PROCESSED ? peso(refundedAmount(b)) : '-',
      !b.refund || b.refund.status === REFUND_STATUS.NONE ? 'No refund' : b.refund.status,
    ]),
    totalRow: ['Total', `${cancelled.length} cancelled`, '', '', '', '', '', peso(totalPaid), peso(totalRefunded), ''],
    notes: [
      basisNote(filters),
      'Amount Paid is what the customer had paid when the booking was cancelled (the refund request records it). Refund Final Amount is shown once the refund is processed.',
      'Bookings cancelled before the cancellation date and who cancelled were recorded show Not recorded; the date then falls back to the refund request date when there is one.',
      scoped.some((b) => b.isBackJob && b.status === BOOKING_STATUS.CANCELLED) ? 'Free back-job repair visits are not included.' : null,
    ].filter(Boolean),
  };
}

export const BUILDERS = {
  requests: buildServiceRequestsReport,
  technicians: buildTechnicianReport,
  customers: buildCustomerReport,
  payments: buildPaymentsReport,
  backjobs: buildBackJobsReport,
  cancelled: buildCancelledReport,
};
