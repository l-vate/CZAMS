import { useState, useEffect, useCallback } from 'react';
import { FiArrowUp, FiArrowDown, FiChevronsUp, FiEye, FiZap } from 'react-icons/fi';
import { API_BASE } from '../config/api';
import { getMemberNames } from '../utils/assignments';

// The Pending queue: first come, first served, and the admin can move a request up, down or
// to the top. Each row shows how many teams are free for that request's date and time block,
// so it is clear when there are more requests than teams. Queue positions are admin-only.
function PendingQueue({ refreshKey, onViewDetails }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState({}); // bookingId -> { text, isError }
  const [error, setError] = useState('');

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bookings/queue`, { headers: authHeaders() });
      setQueue(res.ok ? await res.json() : []);
      if (!res.ok) setError('Could not load the queue.');
    } catch (err) {
      console.error('Error loading queue:', err);
      setError('Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const move = async (bookingId, action) => {
    setBusyId(bookingId);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/queue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Could not move that request.');
        await load();
        return;
      }
      setQueue(data);
    } catch (err) {
      console.error('Error moving request:', err);
      setError('Network error. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const autoAssign = async (bookingId) => {
    setBusyId(bookingId);
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/auto-assign`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        const dates = (data.suggestedDates || []).join(', ');
        setMessage((prev) => ({ ...prev, [bookingId]: { isError: true, text: `${data.message}${dates ? ` Next free dates: ${dates}.` : ''}` } }));
      } else {
        setMessage((prev) => ({ ...prev, [bookingId]: { isError: false, text: `Assigned. ${data.autoAssignNote}` } }));
      }
      await load();
    } catch (err) {
      console.error('Error auto-assigning:', err);
      setMessage((prev) => ({ ...prev, [bookingId]: { isError: true, text: 'Network error. Please try again.' } }));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p>Loading the queue...</p>;

  return (
    <div className="pending-queue">
      <p className="bs-card-sub">
        Pending requests in the order they will be handled: first come, first served unless you move them. Moving a
        request does not approve it. Customers never see their queue position.
      </p>
      {error && <p className="ma-form-error">{error}</p>}

      {queue.length === 0 ? (
        <p className="req-empty">No pending requests. Nothing is waiting for approval.</p>
      ) : (
        <ol className="queue-list">
          {queue.map((item, index) => {
            const b = item.booking;
            const working = busyId === b.bookingId;
            const assigned = getMemberNames(b, '');
            const note = message[b.bookingId];
            return (
              <li className="queue-row" key={b._id}>
                <span className="queue-position" aria-label={`Queue position ${item.position}`}>{item.position}</span>

                <div className="queue-info">
                  <p className="queue-title">{b.service?.name || 'Service'} <span className="queue-id">{b.bookingId}</span></p>
                  <p className="queue-meta">
                    {b.customer?.name || 'Customer'} · {b.date}, {b.time}
                    {b.customer?.clientType === 'Commercial' ? ' · Commercial' : ''}
                  </p>
                  <p className="queue-meta">
                    {assigned ? `Assigned: ${assigned}` : 'Nobody assigned yet'}
                  </p>
                  <p className={`queue-capacity${item.overCapacity ? ' queue-capacity--over' : ''}`}>
                    {item.free} {item.unit}{item.free === 1 ? '' : 's'} free for {b.date} {b.time}
                    {item.positionInBlock ? ` · request ${item.positionInBlock} for this slot` : ''}
                    {item.overCapacity ? ' · Over capacity: more requests than free ' + item.unit + 's' : ''}
                  </p>
                  {note && <p className={note.isError ? 'ma-form-error' : 'queue-note'}>{note.text}</p>}
                </div>

                <div className="queue-actions">
                  <button type="button" className="view-details-btn" onClick={() => move(b.bookingId, 'top')} disabled={working || index === 0} title="Move to top">
                    <FiChevronsUp size={14} /> Top
                  </button>
                  <button type="button" className="view-details-btn" onClick={() => move(b.bookingId, 'up')} disabled={working || index === 0} title="Move up">
                    <FiArrowUp size={14} /> Up
                  </button>
                  <button type="button" className="view-details-btn" onClick={() => move(b.bookingId, 'down')} disabled={working || index === queue.length - 1} title="Move down">
                    <FiArrowDown size={14} /> Down
                  </button>
                  <button type="button" className="view-details-btn" onClick={() => autoAssign(b.bookingId)} disabled={working} title="Auto-assign">
                    <FiZap size={14} /> Auto-assign
                  </button>
                  <button type="button" className="view-details-btn" onClick={() => onViewDetails(b)}>
                    <FiEye size={14} /> Details
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default PendingQueue;
