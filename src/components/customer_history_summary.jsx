import { Link } from 'react-router-dom';
import { formatPeso } from '../utils/bookingPricing';
import { pluralize } from '../utils/pluralize';

// The customer's own "My Booking History" card body: a row of labelled figures, then the links. With no bookings it says so and keeps
// only the My Bookings link. `history` is the answer of GET /users/me/history.
function CustomerHistorySummary({ history }) {
  const { counts } = history;
  const open = counts.pending + counts.approved + counts.inProgress;
  const feedbackCount = history.feedback.length;
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
      <ul className="customer-history-links">
        <li><Link to="/customer/bookings">My Bookings</Link></li>
        {counts.total > 0 && <li><Link to="/customer/billings">Billings</Link></li>}
        {counts.total > 0 && <li><Link to="/customer/bookings">Feedback you gave ({feedbackCount})</Link></li>}
      </ul>
      {history.feedback.slice(0, 3).map((f) => (
        <p key={f.bookingId} className="customer-history-feedback">
          {f.service}: {f.rating !== null ? `${f.rating}/5` : 'no rating'}{f.text ? `, "${f.text}"` : ''}
        </p>
      ))}
    </div>
  );
}

export default CustomerHistorySummary;
