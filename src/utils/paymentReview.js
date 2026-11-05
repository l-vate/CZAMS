// What the payment review window offers. Approve and Reject are for a proof that is WAITING to be checked; once it is verified (or rejected) the window
// shows the outcome, who decided it and when (the payment lines the server keeps), and offers nothing to press. The server refuses a second approval too.
import { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } from '../constants/paymentStatus';

const when = (at) => (at ? new Date(at).toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');

// The latest payment line of a track with one of the outcomes, or undefined (an older booking has none).
function lastEvent(raw, track, outcomes) {
  const events = Array.isArray(raw?.paymentEvents) ? raw.paymentEvents : [];
  return [...events].reverse().find((e) => e.track === track && outcomes.includes(e.status));
}

function line(label, word, event, tail = '') {
  const by = event ? ` by ${event.by?.name || 'an admin'}${event.at ? ` on ${when(event.at)}` : ''}` : '';
  return `${label} ${word}${by}${tail}`;
}

// { awaiting, notes }: awaiting is true while a proof waits to be verified or rejected; notes are the outcome lines to show otherwise.
export function paymentReviewState(raw) {
  const awaiting = raw?.paymentStatus === PAYMENT_STATUS.TO_VERIFY || raw?.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY;
  const notes = [];
  if ([PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.FULLY_PAID].includes(raw?.paymentStatus)) {
    notes.push({ key: 'down', text: line('Down payment', 'verified', lastEvent(raw, 'down', ['verified', 'recorded'])) });
  } else if (raw?.paymentStatus === PAYMENT_STATUS.REJECTED) {
    const event = lastEvent(raw, 'down', ['rejected']);
    notes.push({ key: 'down', text: line('Down payment', 'rejected', event, event?.reason ? `. Reason: ${event.reason}` : '') });
  }
  if (raw?.balancePaymentStatus === BALANCE_PAYMENT_STATUS.PAID) {
    notes.push({ key: 'balance', text: line('Balance', 'verified', lastEvent(raw, 'balance', ['verified', 'recorded'])) });
  } else if (raw?.balancePaymentStatus === BALANCE_PAYMENT_STATUS.REJECTED) {
    const event = lastEvent(raw, 'balance', ['rejected']);
    notes.push({ key: 'balance', text: line('Balance', 'rejected', event, event?.reason ? `. Reason: ${event.reason}` : '') });
  }
  return { awaiting, notes };
}
