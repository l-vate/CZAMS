// The customers an admin can pick for a walk-in booking: active customer accounts only (the server refuses a deactivated one), narrowed by
// the search text on name, e-mail and phone. Plain function, no framework, so the tests load this file on its own.
export function selectableCustomers(customers, search = '') {
  const term = String(search).trim().toLowerCase();
  return (customers || [])
    .filter((c) => c && c.isActive !== false && (!c.role || c.role === 'customer'))
    .filter((c) => !term
      || (c.name || '').toLowerCase().includes(term)
      || (c.email || '').toLowerCase().includes(term)
      || (c.phone || '').toLowerCase().includes(term));
}
