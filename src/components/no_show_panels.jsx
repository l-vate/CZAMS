import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/apiClient';
import { reportNoShow, decideNoShow } from '../services/bookingService';
import { getMemberNames } from '../utils/assignments';
import { bookingWindow, bookingDateProblem } from '../utils/dateRules';
import { TIME_BLOCK_VALUES } from '../constants/timeBlocks';

const NOTE_MAX = 300;
const REASON_MIN = 3;

// What the customer reads for each state of a no show report.
export const NO_SHOW_SENT = 'Your report was sent. The owner will review it.';
const outcomeText = (noShow) => {
  const why = noShow.decisionReason ? ` Reason: ${noShow.decisionReason}` : '';
  if (noShow.status === 'Rejected') return `The owner reviewed your report and did not accept it.${why} Your booking continues.`;
  if (noShow.status === 'Rescheduled') return `The owner rescheduled your booking at no charge.${why} Check the new date and time above.`;
  if (noShow.status === 'Confirmed') return `The owner confirmed the no show and cancelled your booking.${why}`;
  return NO_SHOW_SENT;
};

// The confirmation step of "Report technician no show": an optional note, then send. Escape and Back close it, Tab stays inside it, and focus goes
// back to the button that opened it.
function ReportDialog({ bookingId, saving, error, onConfirm, onClose }) {
  const [note, setNote] = useState('');
  const dialogRef = useRef(null);
  const noteRef = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    noteRef.current?.focus();
    return () => { if (before && typeof before.focus === 'function') before.focus(); };
  }, []);
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && !saving) { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = [...dialogRef.current.querySelectorAll('textarea:not([disabled]), button:not([disabled])')];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return (
    <div className="cbd-overlay" onClick={saving ? undefined : onClose}>
      <div ref={dialogRef} className="cbd-dialog" role="dialog" aria-modal="true" aria-labelledby="ns-title" aria-describedby="ns-warning" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <h3 id="ns-title" className="cbd-title">Report a technician no show for {bookingId}?</h3>
        <p id="ns-warning" className="ns-warning">Only send this if our technicians did not arrive. The owner will review it and decide. A report does not cancel or refund your booking by itself.</p>
        <label className="cbd-text">
          <span className="cbd-text-label">Note for the owner (optional)</span>
          <textarea ref={noteRef} className="cbd-input ns-textarea" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: nobody has come or called since morning" />
          <span className="ns-count" aria-live="polite">{note.length} of {NOTE_MAX}</span>
        </label>
        {error && <p className="cbd-problem" role="alert">{error}</p>}
        <div className="cbd-actions">
          <button type="button" className="sdm-btn sdm-btn-outline cbd-btn" onClick={onClose} disabled={saving}>Back</button>
          <button type="button" className="sdm-btn sdm-btn-danger cbd-btn" onClick={() => onConfirm(note.trim())} disabled={saving}>{saving ? 'Sending...' : 'Send report'}</button>
        </div>
      </div>
    </div>
  );
}

// The customer's side: the waiting note, the action, the pending state and the outcome. `booking.noShowAvailability` is the server's own answer.
export function NoShowCustomerCard({ booking, onChanged }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const noShow = booking.noShow;
  const availability = booking.noShowAvailability;

  const send = async (note) => {
    setSaving(true);
    setError('');
    try {
      onChanged(await reportNoShow(booking.bookingId, note));
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Could not send the report.' : 'Could not connect to server.');
    } finally {
      setSaving(false);
    }
  };

  if (noShow && noShow.status && noShow.status !== 'None') {
    return <p className={`ns-state ns-state--${noShow.status.toLowerCase()}`} role="status">{outcomeText(noShow)}</p>;
  }
  if (availability && availability.canReport) {
    return (
      <>
        <button type="button" className="bs-back-btn ns-report-btn" onClick={() => setOpen(true)}>Report technician no show</button>
        {open && <ReportDialog bookingId={booking.bookingId} saving={saving} error={error} onConfirm={send} onClose={() => { setOpen(false); setError(''); }} />}
      </>
    );
  }
  if (availability && availability.reason === 'wait') {
    return <p className="ns-wait">You can report a no show from {availability.waitUntil} on the service day.</p>;
  }
  return null;
}

// The admin's side, on the booking details: the report, the technicians, and three decisions, each needing a reason. Once decided, a read only record.
export function NoShowAdminPanel({ booking, onUpdated }) {
  const noShow = booking.noShow;
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState(booking.time || 'Morning');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!noShow || !noShow.status || noShow.status === 'None') return null;

  const when = (value) => (value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');
  const open = noShow.status === 'Reported';
  const reasonOk = reason.trim().length >= REASON_MIN && reason.trim().length <= NOTE_MAX;
  const ready = open && action && reasonOk && (action !== 'reschedule' || (date && time));

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      onUpdated(await decideNoShow(booking.bookingId, { action, reason: reason.trim(), date, time }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Could not save the decision.' : 'Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const CHOICES = [
    ['confirm', 'Confirm no show', 'Cancels the booking as the owner: the whole verified down payment is refunded, no fee. The customer is invited to rebook.'],
    ['reschedule', 'Reschedule at no charge', 'Moves the booking to a new date and time you choose with the customer. Payments stay in place.'],
    ['reject', 'Reject the report', 'The booking continues and the customer is told why. Nothing is refunded.'],
  ];

  return (
    <section className="sdm-notice ns-admin" aria-labelledby="ns-admin-title">
      <h3 id="ns-admin-title" className="ns-admin-title">Technician no show reported</h3>
      <dl className="ns-facts">
        <div><dt>Reported</dt><dd>{when(noShow.reportedAt)}</dd></div>
        <div><dt>Assigned technicians</dt><dd>{getMemberNames(booking, 'None assigned')}</dd></div>
        <div><dt>Customer note</dt><dd>{noShow.note || 'No note'}</dd></div>
        {!open && <div><dt>Decision</dt><dd>{noShow.status}{noShow.decisionReason ? `: ${noShow.decisionReason}` : ''}</dd></div>}
      </dl>
      {open && (
        <>
          <fieldset className="ns-choices">
            <legend className="ns-legend">Your decision</legend>
            {CHOICES.map(([key, label, help]) => (
              <label key={key} className={`ns-choice${action === key ? ' ns-choice--on' : ''}`}>
                <input type="radio" name="no-show-decision" value={key} checked={action === key} onChange={() => setAction(key)} />
                <span><strong>{label}</strong><span className="ns-help">{help}</span></span>
              </label>
            ))}
          </fieldset>
          {action === 'reschedule' && (
            <div className="ns-slot">
              <input type="date" className="ma-input" aria-label="New date" min={bookingWindow().min} max={bookingWindow().max} value={date} onChange={(e) => setDate(e.target.value)} />
              {date && bookingDateProblem(date) && <p className="date-problem" role="alert">{bookingDateProblem(date)}</p>}
              <select className="ma-input" aria-label="New time" value={time} onChange={(e) => setTime(e.target.value)}>
                {TIME_BLOCK_VALUES.map((block) => <option key={block} value={block}>{block}</option>)}
              </select>
            </div>
          )}
          <label className="cbd-text">
            <span className="cbd-text-label">Reason (required, the customer is told)</span>
            <input className="cbd-input" type="text" maxLength={NOTE_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {error && <p className="cbd-problem" role="alert">{error}</p>}
          <button type="button" className="sdm-btn sdm-btn-primary ns-submit" onClick={submit} disabled={!ready || saving}>{saving ? 'Saving...' : 'Save decision'}</button>
        </>
      )}
    </section>
  );
}
