// Where a technician goes when they click a notification: the related job on My Jobs, or Chat for a
// chat message. A notification with neither opens nothing (it is only marked as read).
// Where a customer goes when they click a notification: the booking it is about, Chat for a chat message, or the
// booking form for a service reminder (it invites them to book their next cleaning). Anything else opens nothing.
export function customerNotificationTarget(notification) {
  if (!notification) return null;
  if (notification.type === 'chat_message') return '/customer/chat';
  if (notification.relatedBookingId) return `/customer/book_details/${encodeURIComponent(notification.relatedBookingId)}`;
  if (notification.type === 'service_reminder') return '/customer/book_service';
  return null;
}

export function technicianNotificationTarget(notification) {
  if (!notification) return null;
  if (notification.type === 'chat_message') return '/staff/chat';
  if (notification.relatedBookingId) return `/staff/my_jobs?job=${encodeURIComponent(notification.relatedBookingId)}`;
  return null;
}
