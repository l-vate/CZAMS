import { useId, useState } from 'react';
import { FiEye, FiEyeOff, FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiCheck, FiCircle } from 'react-icons/fi';
import { passwordChecks } from '../utils/passwordChecks';

// The pieces the four sign in pages share, so they look and behave the same: a text field, a password field (show or hide, Caps Lock
// warning), the error and success messages, the password rules and the submit button with its loading state. None of them holds any sign in
// logic: the pages keep their own state and handlers.

// A labelled field. `labelAside` is something shown at the right of the label (the "Forgot password?" link). Everything else goes to the input.
export function TextField({ id, label, labelAside, className = '', ...inputProps }) {
  return (
    <div className={`ap-field ${className}`}>
      <div className="ap-label-row">
        <label className="ap-label" htmlFor={id}>{label}</label>
        {labelAside}
      </div>
      <input id={id} className="ap-input" {...inputProps} />
    </div>
  );
}

export function SelectField({ id, label, className = '', children, ...selectProps }) {
  return (
    <div className={`ap-field ${className}`}>
      <label className="ap-label" htmlFor={id}>{label}</label>
      <select id={id} className="ap-input" {...selectProps}>{children}</select>
    </div>
  );
}

// A password field with its own show or hide button (a real button: Tab reaches it, Enter and Space work, and it says what it will do) and a
// Caps Lock warning that appears while the key is on and the field has focus.
export function PasswordField({ id, label, labelAside, className = '', onKeyDown, onKeyUp, onBlur, ...inputProps }) {
  const [shown, setShown] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const capsId = useId();
  const watchCaps = (event) => setCapsOn(event.getModifierState ? event.getModifierState('CapsLock') : false);

  return (
    <div className={`ap-field ${className}`}>
      <div className="ap-label-row">
        <label className="ap-label" htmlFor={id}>{label}</label>
        {labelAside}
      </div>
      <div className="ap-input-wrap">
        <input
          id={id}
          className="ap-input ap-input--password"
          type={shown ? 'text' : 'password'}
          aria-describedby={capsId}
          onKeyDown={(event) => { watchCaps(event); if (onKeyDown) onKeyDown(event); }}
          onKeyUp={(event) => { watchCaps(event); if (onKeyUp) onKeyUp(event); }}
          onBlur={(event) => { setCapsOn(false); if (onBlur) onBlur(event); }}
          {...inputProps}
        />
        <button
          type="button"
          className="ap-toggle"
          onClick={() => setShown((value) => !value)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          aria-controls={id}
        >
          {shown ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
        </button>
      </div>
      <div className="ap-slot" id={capsId} aria-live="polite">
        {capsOn && <p className="ap-caps"><FiAlertTriangle aria-hidden="true" /> Caps Lock is on</p>}
      </div>
    </div>
  );
}

// The error message. The wrapper is always on the page, so a screen reader announces the text when it appears.
export function FormAlert({ children, className = '' }) {
  return (
    <div className={`ap-slot ${className}`} aria-live="assertive" aria-atomic="true">
      {children && (
        <p className="ap-alert">
          <FiAlertCircle aria-hidden="true" />
          <span><span className="ap-sr-only">Error: </span>{children}</span>
        </p>
      )}
    </div>
  );
}

export function FormNotice({ children, className = '' }) {
  return (
    <p className={`ap-notice ${className}`} role="status">
      <FiCheckCircle aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// The live hints under a new password, shared by create account and reset password: red with an open circle until a rule is met, then green
// with a check mark and the words "met" or "not met" for a screen reader.
export function PasswordRules({ password, className = '' }) {
  return (
    <ul className={`ap-rules ${className}`} aria-label="Password rules" aria-live="polite">
      {passwordChecks(password).map((check) => (
        <li key={check.id} className={check.met ? 'ap-rule ap-rule--met' : 'ap-rule'}>
          {check.met ? <FiCheck aria-hidden="true" /> : <FiCircle aria-hidden="true" />}
          <span>{check.label}<span className="ap-sr-only">{check.met ? ' (met)' : ' (not met)'}</span></span>
        </li>
      ))}
    </ul>
  );
}

// The submit button. While `loading` it is disabled (so a second click or Enter cannot send twice) and shows a spinner.
export function SubmitButton({ loading, loadingText, children, className = '' }) {
  return (
    <button type="submit" className={`ap-submit ${className}`} disabled={loading} aria-busy={loading}>
      {loading && <span className="ap-spinner" aria-hidden="true" />}
      {loading ? loadingText : children}
    </button>
  );
}
