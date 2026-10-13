import { useState } from 'react';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB, same rule as every other upload
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Optional Senior Citizen / PWD discount picker, shared by the customer booking wizard
// and the admin walk-in form. One choice at most (ticking the other swaps it, ticking
// the same one clears it). A customer must attach a photo of a valid ID; an admin
// booking on someone's behalf has seen the ID in person, so the upload is optional
// there and the discount is applied straight away.
function DiscountOption({ form, setForm, idRequired, appliesNow, percent, optional = true }) {
  const [fileError, setFileError] = useState('');

  const choose = (type) => {
    setFileError('');
    if (form.discountType === type) {
      setForm({ ...form, discountType: '', discountIdFileObj: null });
    } else {
      setForm({ ...form, discountType: type });
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setFileError('');
      setForm({ ...form, discountIdFileObj: null });
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Only images (JPG, PNG) or PDF files are allowed.');
      setForm({ ...form, discountIdFileObj: null });
      return;
    }
    if (file.size > MAX_SIZE) {
      setFileError('File is too large. Max size is 5MB.');
      setForm({ ...form, discountIdFileObj: null });
      return;
    }
    setFileError('');
    setForm({ ...form, discountIdFileObj: file });
  };

  return (
    <div className="bs-field-group">
      <label className="bs-label">
        Senior Citizen / PWD Discount {optional && <span className="bs-label-hint">(Optional)</span>}
      </label>
      <div className="dp-radio-grid">
        {[['Senior', 'Senior Citizen'], ['PWD', 'PWD']].map(([value, label]) => (
          <label key={value} className="dp-radio-label">
            <input
              type="checkbox"
              className="dp-radio-input"
              checked={form.discountType === value}
              onChange={() => choose(value)}
            />
            {label}
          </label>
        ))}
      </div>

      {form.discountType && (
        <>
          <label className="modal-file-btn discount-option-x1">
            {form.discountIdFileObj ? form.discountIdFileObj.name : '[Choose a photo of a valid ID]'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.pdf"
              className="discount-option-x2"
              onChange={handleFile}
            />
          </label>
          {fileError && (
            <p className="discount-option-x3">{fileError}</p>
          )}
          {idRequired && !form.discountIdFileObj && !fileError && (
            <p className="discount-option-x3">
              A photo of a valid ID is required to request this discount.
            </p>
          )}
          <p className="discount-option-x4">
            {appliesNow
              ? `${percent}% off the unit price is applied right away.`
              : 'Our team will check your ID. The discount is taken off your total only after it is approved, and you will be notified.'}
          </p>
        </>
      )}
    </div>
  );
}

export default DiscountOption;
