import { useEffect, useState } from 'react';
import { getAssignmentHistory } from '../services/bookingService';

const when = (value) => new Date(value).toLocaleString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

// "Anna (lead) + Ben (helper)", or "Anna (solo)" for one technician, or "Nobody" before the first assignment.
function describe(people) {
  if (!people || people.length === 0) return 'Nobody';
  return people
    .map((p) => (p.helper ? `${p.lead} (lead) + ${p.helper} (helper)` : `${p.lead} (solo)`))
    .join(' and ');
}

// Who was assigned to a booking over time, newest last. `admin` shows who made each change and
// why; without it the list is read-only and carries no admin names. `refreshKey` reloads the
// list after an assignment is saved.
function AssignmentHistory({ bookingId, admin = false, refreshKey = '' }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getAssignmentHistory(bookingId)
      .then((list) => { if (!cancelled) setEntries(list); })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, [bookingId, refreshKey]);

  return (
    <div className="assignment-history">
      <p className="sdm-row-label">Assignment history</p>
      {entries.length === 0 ? (
        <p className="sdm-muted">No assignment changes recorded.</p>
      ) : (
        <ol className="assignment-history-list">
          {entries.map((e, i) => (
            <li key={`${e.changedAt}-${i}`}>
              <span className="assignment-history-when">{when(e.changedAt)}</span>
              <span>{describe(e.previous)} to {describe(e.next)}</span>
              {admin && e.changedBy && <span className="sdm-muted">Changed by {e.changedBy}</span>}
              {admin && e.reason && <span className="sdm-muted">Reason: {e.reason}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default AssignmentHistory;
