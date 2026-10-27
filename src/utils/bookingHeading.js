// The heading of a customer's booking page, matching where the booking is now (a finished job must not say "Booking Request Submitted!").
// Plain function, no framework, so the tests load this file on its own.
export function bookingHeading(status) {
  switch (status) {
    case 'Pending': return 'Booking Request Submitted!';
    case 'Approved': return 'Booking Confirmed';
    case 'In Progress': return 'Service In Progress';
    case 'Completed': return 'Service Completed';
    case 'Cancelled': return 'Booking Cancelled';
    default: return 'Booking Details';
  }
}
