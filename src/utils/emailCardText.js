// The words on the "Email notification" card, from what GET /api/bookings/:bookingId/email-status returns. The customer never sees a technical
// reason; the admin also sees the delivery status and a short failure code (never SMTP details). `formatDate` turns a date into text.
export const FAILED_TEXT = 'We could not send the email. You can still see updates in the app.';

export function emailCardText(card, { admin = false, formatDate = (d) => String(d) } = {}) {
  const data = card || { state: 'none' };
  const lines = [];
  let title;
  switch (data.state) {
    case 'sent':
      title = 'Email sent';
      if (data.at) lines.push(formatDate(data.at));
      if (data.maskedTo) lines.push(`To ${data.maskedTo}`);
      break;
    case 'queued':
      title = 'Email will be sent shortly';
      if (data.maskedTo) lines.push(`To ${data.maskedTo}`);
      break;
    case 'failed':
      title = FAILED_TEXT;
      break;
    case 'noAddress':
      title = 'No email address on your account';
      break;
    case 'notConfigured':
      title = admin ? 'Email notifications are not set up' : 'No email sent yet';
      break;
    default:
      title = 'No email sent yet';
  }
  if (admin && data.status) lines.push(`Delivery status: ${data.status}`);
  if (admin && data.failureCode) lines.push(`Reason code: ${data.failureCode}`);
  if (admin && data.configured === false && data.state !== 'notConfigured') lines.push('Email notifications are not set up on this server.');
  return { title, lines };
}
