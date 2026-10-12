// Where a technician goes when they click a notification: the related job on My Jobs, or Chat for a
// chat message. A notification with neither opens nothing (it is only marked as read).
export function technicianNotificationTarget(notification) {
  if (!notification) return null;
  if (notification.type === 'chat_message') return '/staff/chat';
  if (notification.relatedBookingId) return `/staff/my_jobs?job=${encodeURIComponent(notification.relatedBookingId)}`;
  return null;
}
