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
