// Optional Senior Citizen / PWD discount request, shared by the customer booking wizard, the "request after booking" form and the admin
// walk-in form. One tick box, then a choice of Senior Citizen or PWD. No ID number or photo is collected: the owner checks a valid ID in
// person, and the discount is taken off only after the owner applies it (a walk-in booked by an admin is applied right away).
// The form keeps the choice in form.discountType: '' when not requested, 'Senior' or 'PWD' when requested.
function DiscountOption({ form, setForm, appliesNow, percent, optional = true }) {
  const requested = Boolean(form.discountType);

  const toggle = (checked) => setForm({ ...form, discountType: checked ? 'Senior' : '' });

  return (
    <div className="bs-field-group">
      <label className="bs-label">
        Senior Citizen / PWD Discount {optional && <span className="bs-label-hint">(Optional)</span>}
      </label>
      <label className="dp-radio-label">
        <input
          type="checkbox"
          className="dp-radio-input"
          checked={requested}
          onChange={(e) => toggle(e.target.checked)}
        />
        I am a Senior Citizen or PWD and I request the discount
      </label>

      {requested && (
        <>
          <div className="dp-radio-grid" role="radiogroup" aria-label="Discount type">
            {[['Senior', 'Senior Citizen'], ['PWD', 'PWD']].map(([value, label]) => (
              <label key={value} className="dp-radio-label">
                <input
                  type="radio"
                  name="discountType"
                  className="dp-radio-input"
                  checked={form.discountType === value}
                  onChange={() => setForm({ ...form, discountType: value })}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="discount-option-x4">
            {appliesNow
              ? `${percent}% off the service charge is applied right away.`
              : 'A valid ID will be checked by the owner. The discount is taken off the service charge only after the owner approves it, and you will be notified.'}
          </p>
        </>
      )}
    </div>
  );
}

export default DiscountOption;
