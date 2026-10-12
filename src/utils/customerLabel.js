// How to show the customer of a booking on an admin screen or export. When a customer deletes their account
// their completed bookings stay, but the account is gone, so the API sends `customer: null` for them (the
// booking was loaded with its customer and nobody was found). That is shown as "Deleted customer", not as a
// blank, "N/A" or "undefined". A booking that was loaded without its customer (a plain id) uses the fallback.
export const DELETED_CUSTOMER = 'Deleted customer';

export function customerLabel(customer, fallback = 'N/A') {
  if (customer === null) return DELETED_CUSTOMER;
  if (customer && typeof customer === 'object') return customer.name || fallback;
  return fallback;
}
