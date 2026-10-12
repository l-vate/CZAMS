import { useState, useEffect } from 'react';
import { attempt, orFallback } from '../services/apiClient';
import { getTeamAvailability } from '../services/teamService';
import { assignBooking } from '../services/bookingService';
import { getAssignments } from '../utils/assignments';
import { BOOKING_STATUS } from '../constants/bookingStatus';

// The booking's assignment editor: pick a technician, then optionally add a second one.
// A technician shows as busy when they are on another booking in the booking's date and time
// block. The server re-checks all of this. A second technician is optional.
function AssignmentPanel({ booking, onUpdated }) {
  const editable = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status);

  // What is saved on the booking: the first assignment's lead and helper ('' when none).
  const savedPair = () => {
    const first = getAssignments(booking)[0];
    return { lead: first?.lead._id || '', helper: first?.helper?._id || '' };
  };

  const [technicians, setTechnicians] = useState([]);
  const [lead, setLead] = useState(savedPair().lead);
  const [helper, setHelper] = useState(savedPair().helper);
  // The second dropdown shows once the admin asks for it, or when a helper is already saved.
  const [addingSecond, setAddingSecond] = useState(!!savedPair().helper);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const pair = savedPair();
    setLead(pair.lead);
    setHelper(pair.helper);
    setAddingSecond(!!pair.helper);
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

  const savedNow = savedPair();
  const dirty = lead !== savedNow.lead || (addingSecond ? helper : '') !== savedNow.helper;

  const names = getAssignments(booking);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const entry = { technicianId: lead, ...(addingSecond && helper ? { helperId: helper } : {}) };
      const saved = await attempt(assignBooking(booking.bookingId, [entry], reason.trim()), 'Could not save the assignment.');
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

  return (
    <div className="sdm-tech-strip assignment-panel-x1">
      <div className="sdm-tech-info assignment-panel-x2">
        <span className="sdm-row-label">ASSIGNED TECHNICIAN{names.length > 1 || names[0]?.helper ? 'S' : ''}</span>

        {names.length === 0 ? (
          <p className="sdm-muted assignment-panel-x3">Nobody assigned yet.</p>
        ) : (
          <ul className="assignment-list assignment-panel-x4">
            {names.map((a, i) => (
              <li key={i}>
                {a.team ? <strong>{a.team}: </strong> : null}
                {a.lead.name} (lead){a.helper ? `, ${a.helper.name} (helper)` : ''}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <>
            <div className="assignment-panel-x5">
              <select
                className="sdm-tech-select"
                value={lead}
                onChange={(e) => {
                  setLead(e.target.value);
                  if (e.target.value === helper) setHelper('');
                }}
                disabled={saving}
                aria-label="Technician"
              >
                <option value="">Choose a technician</option>
                {technicians.map((t) => (
                  <option key={t._id} value={t._id} disabled={!t.free && lead !== t._id}>
                    {optionLabel(t)}
                  </option>
                ))}
              </select>
            </div>

            {addingSecond && (
              <div className="assignment-panel-x5">
                <select
                  className="sdm-tech-select"
                  value={helper}
                  onChange={(e) => setHelper(e.target.value)}
                  disabled={saving}
                  aria-label="Another technician"
                >
                  <option value="">Choose another technician</option>
                  {technicians.filter((t) => t._id !== lead).map((t) => (
                    <option key={t._id} value={t._id} disabled={!t.free && helper !== t._id}>
                      {optionLabel(t)}
                    </option>
                  ))}
                </select>
                <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => { setAddingSecond(false); setHelper(''); }} disabled={saving}>
                  Remove
                </button>
              </div>
            )}

            <div className="assignment-panel-x6">
              {!addingSecond && (
                <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setAddingSecond(true)} disabled={saving || !lead}>
                  Add another technician
                </button>
              )}
              <button type="button" className="sdm-btn sdm-btn-primary" onClick={save} disabled={saving || !lead || !dirty || (addingSecond && !helper)}>
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
