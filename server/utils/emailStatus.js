// What the "Email notification" card on a booking shows. It reads the saved delivery records (models/EmailDelivery.js) for the viewer and the
// booking and says only what a person may know: whether the email was sent, is waiting, or could not be sent. The address is masked, the
// content is never included, and an error text never leaves the server: the admin gets a short code, nobody gets SMTP details.
// Pure: no database and no environment access here.

// "jane.doe@gmail.com" becomes "j***@gmail.com". Anything that is not an address becomes ''.
function maskEmail(address) {
  const text = typeof address === 'string' ? address.trim() : '';
  const at = text.lastIndexOf('@');
  if (at < 1 || at === text.length - 1) return '';
  return `${text[0]}***@${text.slice(at + 1)}`;
}

// A short code for why a send failed, from the stored error text. Never the text itself (it can name hosts or accounts).
function failureCode(lastError) {
  const text = String(lastError || '');
  if (!text) return 'UNKNOWN';
  if (/settings are incomplete/i.test(text)) return 'NOT_CONFIGURED';
  if (/EAUTH|535|invalid login|authentication/i.test(text)) return 'AUTH_FAILED';
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNECTION|ESOCKET|EDNS|socket|timed? ?out|getaddrinfo/i.test(text)) return 'CONNECTION_FAILED';
  if (/\b55\d\b|recipient|mailbox|rejected/i.test(text)) return 'RECIPIENT_REFUSED';
  return 'SEND_FAILED';
}

const STATE = { sent: 'sent', pending: 'queued', processing: 'queued', failed: 'failed' };

// `delivery` is the most recent record or null. `configured` is whether the server can send email at all. `hasEmail` is whether the viewer's
// account has an address. `admin` adds the delivery status and the failure code. Returns the card's data.
function emailCard({ delivery, configured, hasEmail, admin = false }) {
  if (!hasEmail) return { state: 'noAddress' };
  if (!delivery) return admin && !configured ? { state: 'notConfigured' } : { state: 'none' };
  const state = STATE[delivery.status] || 'queued';
  const card = {
    state,
    at: state === 'sent' ? delivery.sentAt : delivery.createdAt,
    maskedTo: maskEmail(delivery.recipientEmail),
  };
  if (admin) {
    card.status = delivery.status;
    card.attempts = delivery.attempts || 0;
    if (state === 'failed' || (delivery.attempts > 0 && delivery.lastError)) card.failureCode = failureCode(delivery.lastError);
    if (!configured) card.notConfigured = true;
  }
  return card;
}

module.exports = { maskEmail, failureCode, emailCard };
