import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCustomerHistory, getMyHistory } from '../services/userService';

const peso = (n) => `₱${(Math.round(n) || 0).toLocaleString()}`;

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

  if (failed) return <p className="sdm-error">The history could not be loaded.</p>;
  if (!history) return <p className="sdm-muted">Loading history...</p>;

  const { counts } = history;

  if (!admin) {
    return (
      <div className="customer-history">
        <p className="customer-history-counts">
          {counts.total} bookings: {counts.completed} completed, {counts.pending + counts.approved + counts.inProgress} open, {counts.cancelled} cancelled.
          Total paid {peso(history.totalPaid)}.
        </p>
        <p className="customer-history-links">
          <Link to="/customer/bookings">My Bookings</Link>
          {' · '}
          <Link to="/customer/billings">Billings</Link>
          {' · '}
          <Link to="/customer/bookings">Feedback you gave ({history.feedback.length})</Link>
        </p>
        {history.feedback.slice(0, 3).map((f) => (
          <p key={f.bookingId} className="customer-history-feedback">
            {f.service}: {f.rating !== null ? `${f.rating}/5` : 'no rating'}{f.text ? `, "${f.text}"` : ''}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="customer-history">
      <p className="customer-history-counts">
        Bookings {counts.total} · Completed {counts.completed} · Cancelled {counts.cancelled} · Back jobs {counts.backJobs}
        {' · '}Total paid {peso(history.totalPaid)}{history.totalRefunded > 0 ? ` (${peso(history.totalRefunded)} refunded)` : ''}
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
                <td>{b.bookingId}</td><td>{b.service}</td><td>{b.date}</td><td>{b.status}</td><td>{peso(b.total)}</td>
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
