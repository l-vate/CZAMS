// Single source of truth for "what color represents this booking status," used
// wherever a status badge's color is set via inline style (e.g. req-status-badge,
// which only defines shape/typography in admin.css and expects the caller to
// supply the background color). admin/dashboard.jsx and admin/service_requests.jsx
// used to each hardcode their own copy of this mapping and had drifted apart
// (disagreeing on "In Progress"). Values reference the CSS custom properties
// defined in index.css's :root rather than hardcoded hex, so this file and every
// stylesheet stay in sync automatically.
export const STATUS_COLORS = {
  Pending: 'var(--warning)',
  Approved: 'var(--primary)',
  'In Progress': 'var(--status-progress-solid)',
  Completed: 'var(--success)',
  Cancelled: 'var(--danger)',
};

export function getStatusColor(status) {
  return STATUS_COLORS[status] || '#64748b';
}

// Color for a pill-filter's *active* state (.filter-pill--active), keyed by the
// filter's own label/value rather than its position in the row - a page can list
// its filters in any order (or a different subset) and each one still gets its
// matching color. Reuses STATUS_COLORS for booking statuses and extends it with
// payment/refund statuses that show up in other filter rows across the app.
// "All" and anything unmapped (role toggles, client-type filters, etc.) return
// null so the caller falls back to .filter-pill--active's default navy - that
// default already matches what "All" should look like.
const FILTER_PILL_COLORS = {
  ...STATUS_COLORS,
  Rejected: 'var(--danger)',
  rejected: 'var(--danger)',
  Flagged: 'var(--danger)',
  Unpaid: 'var(--danger)',
  unpaid: 'var(--danger)',
  'To Verify': 'var(--warning)',
  to_verify: 'var(--warning)',
  'Partially Paid': 'var(--status-progress-solid)',
  partially_paid: 'var(--status-progress-solid)',
  'Fully Paid': 'var(--success)',
  fully_paid: 'var(--success)',
  Refunded: 'var(--payment-cancelled-txt)',
  Processed: 'var(--success)',
  // Service report resolution outcomes (service_reports.jsx)
  'All Reports': null,
  Complete: 'var(--success)',
  Partial: 'var(--status-progress-solid)',
  Unresolved: 'var(--danger)',
  // Back Job statuses (back_jobs.jsx)
  Scheduled: 'var(--success)',
  'Not Covered': 'var(--danger)',
  Reviewed: 'var(--status-progress-solid)',
};

export function getFilterPillColor(filter) {
  return FILTER_PILL_COLORS[filter] || null;
}

export function getFilterPillStyle(filter, isActive) {
  if (!isActive) return undefined;
  const color = getFilterPillColor(filter);
  return color ? { background: color, borderColor: color } : undefined;
}
