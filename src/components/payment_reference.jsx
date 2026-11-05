import { useEffect, useState } from 'react';
import { getReferenceDuplicates } from '../services/bookingService';
import { referenceWarnings } from '../utils/referenceWarning';

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
      {hasReference && referenceWarnings(duplicates).map((w) => (
        <span key={w.key} className="payment-reference-dup" role="alert">
          Warning: {w.text}
        </span>
      ))}
    </span>
  );
}

export default PaymentReference;
