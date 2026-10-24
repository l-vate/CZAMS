import { useEffect, useState } from 'react';
import { getReferenceDuplicates } from '../services/bookingService';

const NOT_RECORDED = 'Not recorded';

// The reference number(s) of a booking for the admin, with a warning badge for every other
// payment of the same method that carries the same reference. The warning never blocks anything.
function PaymentReference({ booking }) {
  const [duplicates, setDuplicates] = useState([]);
  const bookingId = booking?.bookingId;
  const hasReference = Boolean(booking?.referenceNumber || booking?.balanceReferenceNumber);

  useEffect(() => {
    let cancelled = false;
    if (!bookingId || !hasReference) return undefined;
    getReferenceDuplicates(bookingId).then((found) => {
      if (!cancelled) setDuplicates(found);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [bookingId, hasReference]);

  return (
    <span className="payment-reference">
      <span>{booking?.referenceNumber || NOT_RECORDED}</span>
      {booking?.balanceReferenceNumber && (
        <span>Balance: {booking.balanceReferenceNumber}</span>
      )}
      {hasReference && duplicates.map((d) => (
        <span key={d.bookingId} className="payment-reference-dup" role="alert">
          Warning: this {d.method ? `${d.method} ` : ''}reference number was already used on booking {d.bookingId}. Check that it is not the same payment submitted twice.
        </span>
      ))}
    </span>
  );
}

export default PaymentReference;
