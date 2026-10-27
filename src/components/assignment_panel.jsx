import { useState, useEffect } from 'react';
import { orFallback } from '../services/apiClient';
import { getTeamAvailability } from '../services/teamService';
import { ApiError } from '../services/apiClient';
import { assignBooking, moveToDate } from '../services/bookingService';
import SuggestedDates from './suggested_dates';
import { getMembers, moveItem, canRemoveTechnician } from '../utils/assignments';
import { BOOKING_STATUS } from '../constants/bookingStatus';

// The booking's assignment editor: a plain list of technicians. The first one is the primary technician, the only one who files the
// service report; "Add another technician" adds one more to the list. A technician shows as busy when they are on another booking in
// the booking's date and time block, and one who is already picked elsewhere in this form cannot be picked again. The server re-checks
// all of this, and that the service has enough technicians (two for most services) before it can be approved.
function AssignmentPanel({ booking, onUpdated }) {
  const editable = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status);

  // What is saved on the booking, as a flat list of technician ids (an older lead and helper pair reads as two technicians).
  const savedIds = () => {
    const ids = getMembers(booking).map((m) => m._id);
    return ids.length > 0 ? ids : [''];
  };

  const [technicians, setTechnicians] = useState([]);
  const [picked, setPicked] = useState(savedIds());
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [suggestedDates, setSuggestedDates] = useState([]); // dates offered when nobody is free on the booking's date

  useEffect(() => {
    setPicked(savedIds());
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

  const members = getMembers(booking);

  const comparable = (ids) => JSON.stringify(ids.filter(Boolean));
  const dirty = comparable(picked) !== comparable(members.map((m) => m._id));
  const incomplete = picked.some((id) => !id);

  const setAt = (index, id) => setPicked((prev) => prev.map((x, i) => (i === index ? id : x)));
  // someone picked in any other slot of the form
  const pickedElsewhere = (index) => new Set(picked.filter((id, i) => i !== index && id));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      // one entry per technician, in the order shown: the first is the primary technician
      const entries = picked.map((id) => ({ technicianId: id }));
      setSuggestedDates([]);
      let data;
      try {
        data = await assignBooking(booking.bookingId, entries, reason.trim());
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        setError(err.message || 'Could not save the assignment.');
        setSuggestedDates((err.data && err.data.suggestedDates) || []);
        return;
      }
      onUpdated?.(data);
    } catch (err) {
      console.error('Error saving assignment:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const optionLabel = (t) => `${t.name}${t.position ? ` (${t.position})` : ''}${t.free ? '' : ' - busy'}`;
  const optionsFor = (index, current) => {
    const taken = pickedElsewhere(index);
    // A technician already on the booking is always listed, so the name shows even before (or without) the availability answer.
    const known = new Set(technicians.map((t) => t._id));
    const saved = members.filter((m) => !known.has(m._id)).map((m) => ({ _id: m._id, name: m.name, free: true }));
    return [...technicians, ...saved].filter((t) => !taken.has(t._id)).map((t) => (
      <option key={t._id} value={t._id} disabled={!t.free && current !== t._id}>
        {optionLabel(t)}
      </option>
    ));
  };

  return (
    <div className="sdm-tech-strip assignment-panel-x1">
      <div className="sdm-tech-info assignment-panel-x2">
        {booking.needsReassignment && (
          <p className="sdm-error" role="alert">A technician on this job was deactivated. Assign someone else.</p>
        )}
        <span className="sdm-row-label">ASSIGNED TECHNICIANS</span>
        <p className="sdm-muted assignment-panel-hint">The first technician is the primary one and files the service report. Move a technician up to make them primary.</p>

        {!editable && (members.length === 0 ? (
          <p className="sdm-muted assignment-panel-x3">Nobody assigned yet.</p>
        ) : (
          <ol className="assignment-rows">
            {members.map((m, i) => (
              <li key={m._id} className="assignment-row">
                <span className={i === 0 ? 'assignment-badge assignment-badge--primary' : 'assignment-badge'}>{i === 0 ? 'Primary' : 'Technician'}</span>
                <span className="assignment-row-name">{m.name}</span>
              </li>
            ))}
          </ol>
        ))}

        {editable && (
          <>
            <ol className="assignment-rows">
              {picked.map((id, index) => (
                <li key={index} className="assignment-row">
                  <span className={index === 0 ? 'assignment-badge assignment-badge--primary' : 'assignment-badge'}>{index === 0 ? 'Primary' : 'Technician'}</span>
                  <select
                    className="sdm-tech-select assignment-row-select"
                    value={id}
                    onChange={(e) => setAt(index, e.target.value)}
                    disabled={saving}
                    aria-label={`Technician ${index + 1}`}
                  >
                    <option value="">Choose a technician</option>
                    {optionsFor(index, id)}
                  </select>
                  <span className="assignment-row-actions">
                    <button type="button" className="sdm-btn sdm-btn-outline assignment-move" onClick={() => setPicked((prev) => moveItem(prev, index, index - 1))} disabled={saving || index === 0} aria-label={index === 1 ? 'Make primary' : `Move technician ${index + 1} up`}>
                      {index === 1 ? 'Make primary' : 'Up'}
                    </button>
                    <button type="button" className="sdm-btn sdm-btn-outline assignment-move" onClick={() => setPicked((prev) => moveItem(prev, index, index + 1))} disabled={saving || index === picked.length - 1} aria-label={`Move technician ${index + 1} down`}>
                      Down
                    </button>
                    <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setPicked((prev) => prev.filter((_, i) => i !== index))} disabled={saving || !canRemoveTechnician({ count: picked.length, service: booking.service, status: booking.status })}>
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ol>

            <div className="assignment-panel-x6">
              <button
                type="button"
                className="sdm-btn sdm-btn-outline"
                onClick={() => setPicked((prev) => [...prev, ''])}
                disabled={saving || !picked[picked.length - 1]}
              >
                Add another technician
              </button>
              <button type="button" className="sdm-btn sdm-btn-primary" onClick={save} disabled={saving || !dirty || incomplete}>
                {saving ? 'Saving...' : 'Save assignment'}
              </button>
            </div>
            <input
              type="text"
              className="ma-input"
              aria-label="Reason for the change"
              placeholder="Reason for the change (optional)"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
            />
            {error && <div className="sdm-error assignment-panel-x8">{error}</div>}
            <SuggestedDates
              dates={suggestedDates}
              time={booking.time}
              disabled={saving}
              onUse={async (date, block) => {
                setSaving(true);
                try {
                  const moved = await moveToDate(booking.bookingId, { date, time: block });
                  setSuggestedDates([]);
                  setError('');
                  onUpdated?.(moved);
                } catch (err) {
                  setError(err instanceof ApiError ? err.message || 'Could not move the booking.' : 'Network error. Please try again.');
                } finally {
                  setSaving(false);
                }
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default AssignmentPanel;
