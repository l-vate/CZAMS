import { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';
import { ApiError, attempt } from '../services/apiClient';
import { assignBooking, autoAssignBooking } from '../services/bookingService';
import { getAssignments, getMinTechnicians } from '../utils/assignments';
import { BOOKING_STATUS } from '../constants/bookingStatus';

// The booking's assignment editor: pick a team for the primary assignment and optionally
// add more teams for a big job. A team shows as busy unless BOTH its members are free in
// the booking's date and time block. A single technician can be picked only for a service
// that needs just one (a check-up or survey visit). The server re-checks all of this.
function AssignmentPanel({ booking, onUpdated }) {
  const editable = [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status);
  const needsOnlyOne = getMinTechnicians(booking.service) === 1;

  // The dropdown values for what is saved on the booking: team:<id> or tech:<id>.
  const currentSelections = () => {
    if (booking.assignments?.length > 0) {
      return booking.assignments.map((a) => (a.team ? `team:${a.team._id || a.team}` : `tech:${a.lead._id || a.lead}`));
    }
    return booking.technician ? [`tech:${booking.technician._id || booking.technician}`] : [];
  };

  const [availability, setAvailability] = useState({ teams: [], technicians: [] });
  // always at least one (empty) row so the primary team can be chosen
  const initialRows = () => (currentSelections().length > 0 ? currentSelections() : ['']);
  const [rows, setRows] = useState(initialRows());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [autoNote, setAutoNote] = useState(null); // { bookingId, text }
  const [suggestedDates, setSuggestedDates] = useState([]);

  useEffect(() => {
    setRows(initialRows());
    setError('');
    if (!editable || !booking.date || !booking.time) return;
    const token = localStorage.getItem('token');
    fetch(
      `${API_BASE}/api/teams/availability?date=${booking.date}&time=${encodeURIComponent(booking.time)}&excludeBookingId=${booking.bookingId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((res) => (res.ok ? res.json() : { teams: [], technicians: [] }))
      .then((data) => setAvailability({ teams: data.teams || [], technicians: data.technicians || [] }))
      .catch(() => setAvailability({ teams: [], technicians: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking]);

  const chosen = rows.filter(Boolean);
  const saved = currentSelections().filter(Boolean);
  const dirty = JSON.stringify(chosen) !== JSON.stringify(saved);

  const updateRow = (index, value) => setRows((prev) => prev.map((r, i) => (i === index ? value : r)));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const assignments = chosen.map((v) => (v.startsWith('team:') ? { teamId: v.slice(5) } : { technicianId: v.slice(5) }));
      const saved = await attempt(assignBooking(booking.bookingId, assignments), 'Could not save the assignment.');
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

  // Auto-assign picks a team (or a single technician for a one-person service) and saves it.
  // It never approves: the admin still presses Approve, and can change the assignment by hand.
  const autoAssign = async () => {
    setSaving(true);
    setError('');
    setSuggestedDates([]);
    try {
      const data = await autoAssignBooking(booking.bookingId);
      setAutoNote({ bookingId: booking.bookingId, text: data.autoAssignNote });
      onUpdated?.(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Could not auto-assign.');
        setSuggestedDates(err.data?.suggestedDates || []);
        return;
      }
      console.error('Error auto-assigning:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatDay = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const names = getAssignments(booking);

  return (
    <div className="sdm-tech-strip assignment-panel-x1">
      <div className="sdm-tech-info assignment-panel-x2">
        <span className="sdm-row-label">ASSIGNED TEAM{names.length > 1 ? 'S' : ''}</span>

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
            {rows.map((value, index) => (
              <div key={index} className="assignment-panel-x5">
                <select
                  className="sdm-tech-select"
                  value={value}
                  onChange={(e) => updateRow(index, e.target.value)}
                  disabled={saving}
                  aria-label={index === 0 ? 'Primary team' : `Additional team ${index}`}
                >
                  <option value="">{index === 0 ? 'Choose a team' : 'Choose another team'}</option>
                  <optgroup label="Teams">
                    {availability.teams.map((t) => {
                      const takenElsewhere = rows.some((r, i) => i !== index && r === `team:${t._id}`);
                      return (
                        <option key={t._id} value={`team:${t._id}`} disabled={(!t.free && value !== `team:${t._id}`) || takenElsewhere}>
                          {t.name} ({t.lead.name} + {t.helper.name}){t.free ? '' : ` - busy: ${t.busyMembers.join(', ')}`}
                        </option>
                      );
                    })}
                  </optgroup>
                  {needsOnlyOne && (
                    <optgroup label="Single technician (check-up or survey only)">
                      {availability.technicians.map((t) => (
                        <option key={t._id} value={`tech:${t._id}`} disabled={!t.free && value !== `tech:${t._id}`}>
                          {t.name}{t.free ? '' : ' - busy'}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {index > 0 && (
                  <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} disabled={saving}>
                    Remove
                  </button>
                )}
              </div>
            ))}

            <div className="assignment-panel-x6">
              <button
                type="button"
                className="sdm-btn sdm-btn-outline"
                onClick={() => setRows((prev) => [...prev, ''])}
                disabled={saving || rows.length === 0 || rows.some((r) => !r)}
              >
                Add another team
              </button>
              <button type="button" className="sdm-btn sdm-btn-outline" onClick={autoAssign} disabled={saving}>
                {needsOnlyOne ? 'Auto-assign technician' : 'Auto-assign team'}
              </button>
              <button type="button" className="sdm-btn sdm-btn-primary" onClick={save} disabled={saving || chosen.length === 0 || !dirty}>
                {saving ? 'Saving...' : 'Save assignment'}
              </button>
            </div>
            {needsOnlyOne ? (
              <p className="sdm-muted assignment-panel-x7">This service needs 1 technician, so a single technician is allowed.</p>
            ) : (
              <p className="sdm-muted assignment-panel-x7">This service needs a team of 2 (a lead and a helper).</p>
            )}
            {autoNote && autoNote.bookingId === booking.bookingId && (
              <div className="sdm-notice assignment-panel-x8">Auto-assigned. {autoNote.text} You can still change it, then press Approve.</div>
            )}
            {error && <div className="sdm-error assignment-panel-x8">{error}</div>}
            {suggestedDates.length > 0 && (
              <div className="sdm-notice assignment-panel-x8">
                Next dates with someone free in this {booking.time} block: <strong>{suggestedDates.map(formatDay).join(', ')}</strong>. Ask the customer to reschedule, or pick a team by hand.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AssignmentPanel;
