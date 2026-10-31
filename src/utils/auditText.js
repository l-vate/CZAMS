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

const ENTITY_LABEL = { Booking: 'Booking', User: 'Account', Service: 'Service', TechnicianOff: 'Technician time off', Closure: 'Closed date', Report: 'Service report', Promo: 'Promotion' };

// "distanceAdjustment" becomes "Distance adjustment"; "unit_source" becomes "Unit source".
function labelOf(key) {
  const text = String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._]+/g, ' ').trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MONEY_KEY = /amount|fee|adjustment|price|total|payment$/i;
const peso = (n) => '₱' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

// One value in words: Yes or No, a peso amount for a money field, a list joined with commas, a "before to after" pair, or a short text.
function valueOf(key, value) {
  if (value === null || value === undefined || value === '') return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return MONEY_KEY.test(key) ? peso(value) : String(value);
  if (Array.isArray(value)) return value.length === 0 ? 'None' : value.map((v) => valueOf(key, v)).join(', ');
  if (typeof value === 'object') {
    if ('before' in value || 'after' in value) return valueOf(key, value.before) + ' → ' + valueOf(key, value.after);
    return Object.entries(value).map(([k, v]) => labelOf(k) + ': ' + valueOf(k, v)).join('; ');
  }
  return String(value);
}

// The text inside "View details", as labelled rows instead of raw JSON: what happened, who, when, which record, the values that changed (named
// in words), and the action code last, for support. Never shown until the person asks.
export function auditDetails(line) {
  const { who, what } = describeAudit(line);
  const meta = line?.meta && Object.keys(line.meta).length > 0 ? line.meta : null;
  const exact = line?.createdAt ? new Date(line.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'medium' }) + ' (Manila time)' : '';
  const typeName = String(line?.entityType || '');
  const capitalised = typeName.charAt(0).toUpperCase() + typeName.slice(1);
  const kind = ENTITY_LABEL[capitalised] || capitalised;
  return {
    what,
    who: [who, line?.actor?.role ? `(${line.actor.role})` : ''].filter(Boolean).join(' '),
    when: exact,
    action: line?.action || '',
    record: [kind, line?.entityId].filter(Boolean).join(' '),
    role: line?.actor?.role || '',
    values: meta ? Object.entries(meta).map(([key, value]) => [labelOf(key), valueOf(key, value)]) : [],
    meta: meta ? JSON.stringify(meta, null, 2) : '',
  };
}
