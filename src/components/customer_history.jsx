import { useEffect, useState } from 'react';
import { getCustomerHistory, getMyHistory } from '../services/userService';
import { formatPeso } from '../utils/bookingPricing';
import CustomerHistorySummary from './customer_history_summary';

// A customer's history. `userId` set: the admin view (latest bookings, counts, total paid and the
// feedback the customer gave). Left out: the customer's own short summary for the profile page.
function CustomerHistory({ userId }) {
  const [history, setHistory] = useState(null);
  const [failed, setFailed] = useState(false);
  const admin = Boolean(userId);

  useEffect(() => {
    let cancelled = false;
    (admin ? getCustomerHistory(userId) : getMyHistory())
      .then((data) => { if (!cancelled) { setHistory(data); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [userId, admin]);

  // A new customer's own card says there is no history yet (the same wording as the summary); an admin looking at an account still gets the error.
  if (failed && !admin) return <p className="customer-history-empty">You have no booking history yet.</p>;
  if (failed) return <p className="sdm-error">The history could not be loaded.</p>;
  if (!history) return <p className="sdm-muted">Loading history...</p>;

  const { counts } = history;

  if (!admin) return <CustomerHistorySummary history={history} />;

  return (
    <div className="customer-history">
      <p className="customer-history-counts">
        Bookings {counts.total} · Completed {counts.completed} · Cancelled {counts.cancelled} · Back jobs {counts.backJobs}
        {' · '}Total paid {formatPeso(history.totalPaid)}{history.totalRefunded > 0 ? ` (${formatPeso(history.totalRefunded)} refunded)` : ''}
      </p>

      {history.recent.length === 0 ? (
        <p className="sdm-muted">No bookings yet.</p>
      ) : (
        <table className="analytics-table customer-history-table">
          <thead>
            <tr><th>Booking</th><th>Service</th><th>Date</th><th>Status</th><th>Total</th></tr>
          </thead>
          <tbody>
            {history.recent.map((b) => (
              <tr key={b.bookingId}>
                <td>{b.bookingId}</td><td>{b.service}</td><td>{b.date}</td><td>{b.status}</td><td>{formatPeso(b.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="sdm-row-label">Feedback given</p>
      {history.feedback.length === 0 ? (
        <p className="sdm-muted">No feedback yet.</p>
      ) : (
        <ul className="customer-history-feedback-list">
          {history.feedback.map((f) => (
            <li key={f.bookingId}>
              <strong>{f.rating !== null ? `${f.rating}/5` : 'No rating'}</strong> on {f.bookingId} ({f.service}){f.text ? `: ${f.text}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CustomerHistory;
