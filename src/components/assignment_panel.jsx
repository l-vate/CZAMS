import { useState, useEffect } from 'react';
import { attempt, orFallback } from '../services/apiClient';
import { getTeamAvailability } from '../services/teamService';
import { assignBooking } from '../services/bookingService';
import { getAssignments } from '../utils/assignments';
import { BOOKING_STATUS } from '../constants/bookingStatus';

// The booking's assignment editor: one or more pairs. Each pair has a lead and an optional helper. The lead of the
// first pair is the primary lead, the only technician who files the service report on a job with several pairs.
// A technician shows as busy when they are on another booking in the booking's date and time block, and one who is
// already picked in another slot of this form cannot be picked again. The server re-checks all of this.
// `helper: null` means the helper dropdown is hidden; `helper: ''` means shown and still empty.
function AssignmentPanel({ booking, onUpdated }) {
  const editable = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status);

  // What is saved on the booking, as editable pairs (one empty pair when nobody is assigned yet).
  const savedPairs = () => {
    const list = getAssignments(booking).map((a) => ({ lead: a.lead._id, helper: a.helper ? a.helper._id : null }));
    return list.length > 0 ? list : [{ lead: '', helper: null }];
  };

  const [technicians, setTechnicians] = useState([]);
  const [pairs, setPairs] = useState(savedPairs());
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setPairs(savedPairs());
    setError('');
    if (!editable || !booking.date || !booking.time) return;
    orFallback(
      getTeamAvailability({ date: booking.date, time: booking.time, excludeBookingId: booking.bookingId }),
      { technicians: [] }
    )
      .then((data) => setTechnicians(data.technicians || []))
      .catch(() => setTechnicians([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking]);

  const comparable = (list) => JSON.stringify(list.filter((p) => p.lead).map((p) => [p.lead, p.helper || '']));
  const dirty = comparable(pairs) !== comparable(getAssignments(booking).map((a) => ({ lead: a.lead._id, helper: a.helper ? a.helper._id : null })));
  const incomplete = pairs.some((p) => !p.lead || p.helper === '');

  const names = getAssignments(booking);
  const manyPairs = names.length > 1;

  const setPair = (index, change) => setPairs((prev) => prev.map((p, i) => (i === index ? { ...p, ...change } : p)));
  // someone picked in any other slot of the form
  const pickedElsewhere = (index, role) => new Set(pairs.flatMap((p, i) => [
    i === index && role === 'lead' ? null : p.lead,
    i === index && role === 'helper' ? null : p.helper,
  ]).filter(Boolean));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const entries = pairs.map((p) => ({ technicianId: p.lead, ...(p.helper ? { helperId: p.helper } : {}) }));
      const saved = await attempt(assignBooking(booking.bookingId, entries, reason.trim()), 'Could not save the assignment.');
      if (saved.error) {
        setError(saved.error);
        return;
      }
      onUpdated?.(saved.data);
    } catch (err) {
      console.error('Error saving assignment:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const optionLabel = (t) => `${t.name}${t.position ? ` (${t.position})` : ''}${t.free ? '' : ' - busy'}`;
  const optionsFor = (index, role, current) => {
    const taken = pickedElsewhere(index, role);
    return technicians.filter((t) => !taken.has(t._id)).map((t) => (
      <option key={t._id} value={t._id} disabled={!t.free && current !== t._id}>
        {optionLabel(t)}
      </option>
    ));
  };

  return (
    <div className="sdm-tech-strip assignment-panel-x1">
      <div className="sdm-tech-info assignment-panel-x2">
        <span className="sdm-row-label">ASSIGNED TECHNICIAN{manyPairs || names[0]?.helper ? 'S' : ''}</span>

        {names.length === 0 ? (
          <p className="sdm-muted assignment-panel-x3">Nobody assigned yet.</p>
        ) : (
          <ul className="assignment-list assignment-panel-x4">
            {names.map((a, i) => (
              <li key={i}>
                {manyPairs ? <strong>{i === 0 ? 'Pair 1 (primary, files the report): ' : `Pair ${i + 1}: `}</strong> : null}
                {a.team ? <strong>{a.team}: </strong> : null}
                {a.lead.name} (lead){a.helper ? `, ${a.helper.name} (helper)` : ''}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <>
            {pairs.map((pair, index) => (
              <div key={index} className="assignment-panel-x5">
                {pairs.length > 1 && (
                  <span className="sdm-row-label">{index === 0 ? 'PAIR 1 - PRIMARY LEAD FILES THE REPORT' : `PAIR ${index + 1}`}</span>
                )}
                <select
                  className="sdm-tech-select"
                  value={pair.lead}
                  onChange={(e) => setPair(index, { lead: e.target.value })}
                  disabled={saving}
                  aria-label={pairs.length > 1 ? `Lead technician, pair ${index + 1}` : 'Technician'}
                >
                  <option value="">Choose a technician</option>
                  {optionsFor(index, 'lead', pair.lead)}
                </select>

                {pair.helper !== null && (
                  <>
                    <select
                      className="sdm-tech-select"
                      value={pair.helper}
                      onChange={(e) => setPair(index, { helper: e.target.value })}
                      disabled={saving}
                      aria-label={pairs.length > 1 ? `Helper, pair ${index + 1}` : 'Another technician'}
                    >
                      <option value="">Choose another technician</option>
                      {optionsFor(index, 'helper', pair.helper)}
                    </select>
                    <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setPair(index, { helper: null })} disabled={saving}>
                      Remove
                    </button>
                  </>
                )}
                {pair.helper === null && (
                  <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setPair(index, { helper: '' })} disabled={saving || !pair.lead}>
                    Add another technician
                  </button>
                )}
                {pairs.length > 1 && (
                  <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setPairs((prev) => prev.filter((_, i) => i !== index))} disabled={saving}>
                    Remove pair
                  </button>
                )}
              </div>
            ))}

            <div className="assignment-panel-x6">
              <button
                type="button"
                className="sdm-btn sdm-btn-outline"
                onClick={() => setPairs((prev) => [...prev, { lead: '', helper: null }])}
                disabled={saving || !pairs[pairs.length - 1].lead}
              >
                Add another pair
              </button>
              <button type="button" className="sdm-btn sdm-btn-primary" onClick={save} disabled={saving || !dirty || incomplete}>
                {saving ? 'Saving...' : 'Save assignment'}
              </button>
            </div>
            <input
              type="text"
              className="ma-input"
              aria-label="Reason for the change"
              placeholder="Reason for the change (optional, kept in the assignment history)"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
            />
            {error && <div className="sdm-error assignment-panel-x8">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

export default AssignmentPanel;
