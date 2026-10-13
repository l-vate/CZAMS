// Which client group a booking's customer belongs to for the client type filters and the reports. A customer whose account was
// deleted has no record any more, so they are "Unknown": counting them as Residential would put their bookings in numbers they
// do not belong to.
export const CLIENT_GROUP_UNKNOWN = 'Unknown';

export function clientGroupOf(customer) {
  if (!customer) return CLIENT_GROUP_UNKNOWN;
  return customer.clientType || 'Residential';
}
