import { localDigits, isPhMobile, PH_MOBILE_MESSAGE } from '../utils/philippinePhone';

// A Philippine mobile number box with +63 fixed in front: the person types only the 10 digits that follow (9XX XXX XXXX). A number pasted
// as 0917..., 917... or +63 917... lands in the same place. `value` is those 10 digits (or fewer while typing); the form turns them into
// "+63 917 123 4567" when it saves. The message under the box shows only when `showError` is on and the number is wrong.
function PhoneField({ id, value, onChange, showError = false, disabled = false }) {
  const bad = showError && !isPhMobile(value);
  return (
    <div className="phone-field-wrap">
      <div className={`phone-field${bad ? ' phone-field--bad' : ''}`}>
        <span className="phone-field-prefix" aria-hidden="true">+63</span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className="phone-field-input"
          placeholder="917 123 4567"
          maxLength={14}
          aria-label="Mobile number after +63"
          aria-invalid={bad}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(localDigits(e.target.value).slice(0, 10))}
        />
      </div>
      {bad && <p className="ma-form-error phone-field-error">{PH_MOBILE_MESSAGE}</p>}
    </div>
  );
}

export default PhoneField;
