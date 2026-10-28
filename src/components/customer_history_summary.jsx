import { formatPeso } from '../utils/bookingPricing';
import { pluralize } from '../utils/pluralize';

// The customer's own "My Booking History" card body: a row of labelled figures (and a few feedback lines). With no bookings it says so.
// `history` is the answer of GET /users/me/history.
function CustomerHistorySummary({ history }) {
  const { counts } = history;
  const open = counts.pending + counts.approved + counts.inProgress;
  const stats = [
    ['Total', counts.total],
    ['Completed', counts.completed],
    ['Open', open],
    ['Cancelled', counts.cancelled],
    ['Total paid', formatPeso(history.totalPaid)],
  ];

  return (
    <div className="customer-history">
      {counts.total === 0 ? (
        <p className="customer-history-empty">You have no booking history yet.</p>
      ) : (
        <dl className="customer-history-stats" aria-label={`${counts.total} ${pluralize(counts.total, 'booking')}`}>
          {stats.map(([label, value]) => (
            <div className="customer-history-stat" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {history.feedback.slice(0, 3).map((f) => (
        <p key={f.bookingId} className="customer-history-feedback">
          {f.service}: {f.rating !== null ? `${f.rating}/5` : 'no rating'}{f.text ? `, "${f.text}"` : ''}
        </p>
      ))}
    </div>
  );
}

export default CustomerHistorySummary;
