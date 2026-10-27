// The audit log in plain words. Each line says who did what and when; the technical record (action code, record, raw values) is kept
// for a "View details" toggle instead of being shown by default.

const PHRASES = {
  'booking.approve': 'Approved a booking',
  'booking.cancel': 'Cancelled a booking',
  'booking.charges': 'Changed the charges on a booking',
  'booking.instructions': 'Changed the instructions on a booking',
  'booking.unit_source': 'Changed where the unit comes from',
  'booking.unit_decline': 'Said the owner cannot supply a unit',
  'discount.id_photo_deleted': 'Deleted a discount ID photo',
  'payment.verify': 'Verified a payment',
  'payment.reject': 'Rejected a payment',
  'payment.reverse': 'Reversed a payment',
  'quotation.update': 'Updated a quotation',
  'service.archive': 'Archived a service',
  'service.delete': 'Deleted a service',
  'user.activate': 'Activated an account',
  'user.deactivate': 'Deactivated an account',
  'user.role': 'Changed an account role',
  'user.update': 'Updated an account',
  'user.payment_terms': 'Changed payment terms for a customer',
  'password.reset_requested': 'Asked for a password reset link',
  'password.reset_completed': 'Reset a password with an emailed link',
};

// "technician_off.set" becomes "Technician off set".
function humanize(action) {
  const text = String(action || 'Unknown action').replace(/[._]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// { who, what, when } for one audit line. `when` is Manila time.
export function describeAudit(line) {
  const actor = line?.actor || {};
  const who = actor.name || actor.id || 'Unknown';
  const what = (line?.summary && String(line.summary).trim()) || PHRASES[line?.action] || humanize(line?.action);
  const when = line?.createdAt ? new Date(line.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '';
  return { who, what, when };
}

// The text inside "View details": the record and the values, with the raw JSON at the end. Never shown until the person asks.
export function auditDetails(line) {
  const meta = line?.meta && Object.keys(line.meta).length > 0 ? JSON.stringify(line.meta, null, 2) : '';
  return {
    action: line?.action || '',
    record: [line?.entityType, line?.entityId].filter(Boolean).join(' '),
    role: line?.actor?.role || '',
    meta,
  };
}
