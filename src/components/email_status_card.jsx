import { useEffect, useState } from 'react';
import { FiMail } from 'react-icons/fi';
import { getEmailStatus } from '../services/bookingService';
import { orFallback } from '../services/apiClient';
import { emailCardText } from '../utils/emailCardText';

const formatDate = (value) => new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// The card itself, from data already in hand (so it can be drawn and tested without a request).
export function EmailStatusView({ card, admin = false }) {
  const { title, lines } = emailCardText(card, { admin, formatDate });
  return (
    <div className="confirmation-notif-card email-status-card" data-state={card?.state || 'none'}>
      <p className="confirmation-notif-title"><FiMail /> Email notification</p>
      <p className="email-status-title">{title}</p>
      {lines.map((line) => <p key={line} className="confirmation-notif-sub" title={line}>{line}</p>)}
    </div>
  );
}

// The "Email notification" card next to the in-app one: the most recent email about this booking for the person looking. Shows nothing at all
// when the answer cannot be read (the booking page works without it).
function EmailStatusCard({ bookingId, admin = false }) {
  const [card, setCard] = useState(null);
  useEffect(() => {
    let cancelled = false;
    orFallback(getEmailStatus(bookingId), null).then((data) => { if (!cancelled) setCard(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [bookingId]);
  if (!card) return null;
  return <EmailStatusView card={card} admin={admin} />;
}

export default EmailStatusCard;
