import { useState } from 'react';
import { cannotSupplyUnit, withdrawCannotSupply } from '../services/suppliedUnitService';
import { attempt } from '../services/apiClient';
import { BOOKING_STATUS } from '../constants/bookingStatus';

// "Cannot supply this unit": on a Pending booking where the company is to supply the unit, the owner can tell the customer it does not have
// it. A short reason is required; the note is optional and is the place to say which units the owner does have. Nothing is cancelled: the
// customer is told in the app (and by email) and can cancel or get in touch. Admin only; the server enforces all of it.
function CannotSupplyPanel({ booking, onUpdated }) {
  const supplies = booking.clientSuppliedUnit !== true && (booking.units || []).some((u) => u.supplied);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // once the owner has set the unit (picked it or entered it) there is nothing left to say no to
  const unitSettled = (booking.units || []).some((u) => u.supplied?.resolvedAt);
  if (booking.status !== BOOKING_STATUS.PENDING || !supplies || (unitSettled && !booking.unitDecline?.reason)) return null;
  const decline = booking.unitDecline;

  const run = async (promise, fallback, done) => {
    setSaving(true);
    setError('');
    try {
      const result = await attempt(promise, fallback);
      if (result.error) { setError(result.error); return; }
      done?.();
      onUpdated?.(result.data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="cannot-supply-panel" aria-label="Cannot supply this unit">
      {decline?.reason ? (
        <div className="cannot-supply-sent">
          <p className="cannot-supply-title">The customer was told we cannot supply this unit</p>
          <dl className="cannot-supply-details">
            <div><dt>Reason</dt><dd>{decline.reason}</dd></div>
            {decline.note && <div><dt>Note to the customer</dt><dd>{decline.note}</dd></div>}
          </dl>
          <button type="button" className="sdm-btn sdm-btn-outline" disabled={saving} onClick={() => run(withdrawCannotSupply(booking.bookingId), 'Could not withdraw it.')}>
            Withdraw this notice
          </button>
        </div>
      ) : !open ? (
        <button type="button" className="sdm-btn sdm-btn-outline" onClick={() => setOpen(true)}>Cannot supply this unit</button>
      ) : (
        <div className="cannot-supply-form">
          <label className="scope-form-wide">
            Reason (required, the customer is told)
            <input className="ma-input" type="text" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: we do not carry that brand" />
          </label>
          <label className="scope-form-wide">
            Note to the customer (optional)
            <textarea className="ma-input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: which units we do have, so they can choose another" />
          </label>
          <p className="sdm-muted">The booking is not cancelled. The customer can cancel it or contact us.</p>
          <div className="scope-actions">
            <button type="button" className="sdm-btn sdm-btn-outline" disabled={saving} onClick={() => setOpen(false)}>Back</button>
            <button
              type="button" className="sdm-btn sdm-btn-danger" disabled={saving || reason.trim().length < 3}
              onClick={() => run(cannotSupplyUnit(booking.bookingId, { reason: reason.trim(), note: note.trim() }), 'Could not send it.', () => { setOpen(false); setReason(''); setNote(''); })}
            >{saving ? 'Sending...' : 'Tell the customer'}</button>
          </div>
        </div>
      )}
      {error && <p className="ma-form-error" role="alert">{error}</p>}
    </section>
  );
}

export default CannotSupplyPanel;
