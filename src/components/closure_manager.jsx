import { useEffect, useState } from 'react';
import { listClosures, addClosure, deleteClosure } from '../services/closureService';
import { attempt } from '../services/apiClient';
import { formatClosureDate, affectedBookingsNote } from '../utils/closureDates';
import { REASON_MIN, REASON_MAX } from '../constants/closures';

// Admin panel: dates the shop is closed. Closing a date never cancels or moves a booking; the
// panel only warns how many Pending or Approved bookings are already on it.
function ClosureManager() {
  const [closures, setClosures] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setClosures(await listClosures());
      setLoadError('');
    } catch {
      setLoadError('Could not load the closed dates. Please refresh the page.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    listClosures()
      .then((list) => { if (!cancelled) setClosures(list); })
      .catch(() => { if (!cancelled) setLoadError('Could not load the closed dates. Please refresh the page.'); });
    return () => { cancelled = true; };
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setWarning('');
    const text = reason.trim();
    if (!date) { setError('Choose a date.'); return; }
    if (text.length < REASON_MIN || text.length > REASON_MAX) {
      setError(`Give a reason of ${REASON_MIN} to ${REASON_MAX} characters.`);
      return;
    }
    setSaving(true);
    try {
      const saved = await attempt(addClosure({ date, reason: text }), 'Failed to close the date.');
      if (saved.error) { setError(saved.error); return; }
      setWarning(affectedBookingsNote(saved.data.affectedBookings));
      setDate('');
      setReason('');
      await load();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (closureDate) => {
    setError('');
    setWarning('');
    try {
      const removed = await attempt(deleteClosure(closureDate), 'Failed to open the date.');
      if (removed.error) { setError(removed.error); return; }
      await load();
    } catch {
      setError('Network error. Please try again.');
    }
  };

  return (
    <section className="closure-manager">
      <h3 className="closure-manager-title">Closed Dates</h3>
      <p className="closure-manager-sub">
        Customers cannot book or reschedule onto a closed date. Bookings already on the date are left as they are.
      </p>

      <form className="closure-manager-form" onSubmit={handleAdd}>
        <input
          type="date"
          className="ma-input"
          aria-label="Closed date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          type="text"
          className="ma-input"
          aria-label="Reason"
          placeholder="Reason, e.g. Holiday"
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="submit" className="ma-submit-btn" disabled={saving}>
          {saving ? 'Saving...' : 'Close this date'}
        </button>
      </form>

      {error && <p className="ma-form-error">{error}</p>}
      {warning && <p className="closure-warning" role="status">{warning}</p>}
      {loadError && <p className="ma-form-error">{loadError}</p>}

      {closures.length === 0 && !loadError ? (
        <p className="closure-empty">No upcoming closed dates.</p>
      ) : (
        <ul className="closure-list">
          {closures.map((c) => (
            <li key={c.date} className="closure-item">
              <div>
                <strong>{formatClosureDate(c.date)}</strong>
                <span className="closure-reason">{c.reason}</span>
                {c.affectedBookings > 0 && (
                  <span className="closure-warning">{affectedBookingsNote(c.affectedBookings)}</span>
                )}
              </div>
              <button type="button" className="ma-cancel-btn" onClick={() => handleDelete(c.date)}>
                Open again
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ClosureManager;
