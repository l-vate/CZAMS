import { useEffect, useRef, useState } from 'react';
import { CANCEL_CHOICES, OWNER_REFUND_NOTE, REASON_MAX, cancelRequest, needsText } from '../utils/cancelBooking';

// The confirmation step of "Cancel Booking": say why, then confirm. The reason is required. "We cannot supply or serve" is the owner cancelling
// (the customer gets the whole verified down payment back, no transportation fee, on any date); the other reasons use the normal refund rule.
// Escape and Back close it, Tab stays inside it, and focus goes back to where it was.
// onConfirm(body) is given the request for adminUpdateBooking; the caller closes the dialog when it worked.
export function CancelBookingDialog({ bookingId, saving = false, error = '', onConfirm, onClose, initialChoice = null, initialText = '' }) {
  const [choice, setChoice] = useState(initialChoice);
  const [text, setText] = useState(initialText);
  const [touched, setTouched] = useState(false);
  const dialogRef = useRef(null);
  const firstRef = useRef(null);
  const textRef = useRef(null);
  const request = cancelRequest(choice, text);

  // focus the first reason when it opens and give focus back to the Cancel Booking button when it closes
  useEffect(() => {
    const before = document.activeElement;
    firstRef.current?.focus();
    return () => { if (before && typeof before.focus === 'function') before.focus(); };
  }, []);

  const choose = (key) => {
    setChoice(key);
    setTouched(false);
    // the text box for that choice gets the cursor
    if (needsText(key)) requestAnimationFrame(() => textRef.current?.focus());
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && !saving) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    // eslint-disable-next-line no-restricted-syntax -- a focus trap needs the dialog's own controls, found through its ref
    const items = [...dialogRef.current.querySelectorAll('input:not([disabled]), button:not([disabled])')];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const confirm = () => {
    if (request.problem) { setTouched(true); return; }
    onConfirm(request.body);
  };

  return (
    <div className="cbd-overlay" onClick={saving ? undefined : onClose}>
      <div
        ref={dialogRef}
        className="cbd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cbd-title"
        aria-describedby="cbd-warning"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h3 id="cbd-title" className="cbd-title">Cancel booking {bookingId}?</h3>
        <p id="cbd-warning" className="cbd-warning">This cannot be undone.</p>

        <fieldset className="cbd-reasons">
          <legend className="cbd-legend">Reason for cancelling <span aria-hidden="true">(required)</span></legend>
          {CANCEL_CHOICES.map((option, index) => (
            <label key={option.key} className={`cbd-choice${choice === option.key ? ' cbd-choice--on' : ''}`}>
              <input
                ref={index === 0 ? firstRef : undefined}
                type="radio"
                name="cancel-reason"
                value={option.key}
                checked={choice === option.key}
                onChange={() => choose(option.key)}
                required
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>

        {needsText(choice) && (
          <label className="cbd-text">
            <span className="cbd-text-label">{choice === 'owner' ? 'Details (the customer is told)' : 'Reason (required)'}</span>
            <input
              ref={textRef}
              className="cbd-input"
              type="text"
              maxLength={REASON_MAX}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && Boolean(request.problem)}
              aria-describedby={touched && request.problem ? 'cbd-problem' : undefined}
              placeholder={choice === 'owner' ? 'For example: we do not carry that brand' : 'A few words on why'}
            />
          </label>
        )}

        {choice === 'owner' && <p className="cbd-refund-note">{OWNER_REFUND_NOTE}</p>}
        {/* the space for the message is always there while a text box is, so it appearing on blur never moves the choices (a click on another choice
            would otherwise miss: the dialog is centered and grows) */}
        {needsText(choice) && <p id="cbd-problem" className="cbd-problem cbd-problem--slot" aria-live="polite">{touched && request.problem ? request.problem : ''}</p>}
        {error && <p className="cbd-problem" role="alert">{error}</p>}

        <div className="cbd-actions">
          <button type="button" className="sdm-btn sdm-btn-outline cbd-btn" onClick={onClose} disabled={saving}>Back</button>
          <button type="button" className="sdm-btn sdm-btn-danger cbd-btn" onClick={confirm} disabled={saving || Boolean(request.problem)}>
            {saving ? 'Cancelling...' : 'Cancel Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CancelBookingDialog;
