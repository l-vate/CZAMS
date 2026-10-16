import { useState } from 'react';
import { shrinkPhoto } from '../utils/photoShrink';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB, same rule as every other upload
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Optional Senior Citizen / PWD discount picker, shared by the customer booking wizard
// and the admin walk-in form. One choice at most (ticking the other swaps it, ticking
// the same one clears it). A customer must attach a photo of a valid ID; an admin
// booking on someone's behalf has seen the ID in person, so the upload is optional
// there and the discount is applied straight away.
function DiscountOption({ form, setForm, idRequired, appliesNow, percent, optional = true }) {
  const [fileError, setFileError] = useState('');
  const [preparing, setPreparing] = useState(false);

  const choose = (type) => {
    setFileError('');
    if (form.discountType === type) {
      setForm({ ...form, discountType: '', discountIdFileObj: null });
    } else {
      setForm({ ...form, discountType: type });
    }
  };

  const handleFile = async (e) => {
    const picked = e.target.files[0];
    if (!picked) {
      setFileError('');
      setForm((f) => ({ ...f, discountIdFileObj: null }));
      return;
    }
    if (!ALLOWED_TYPES.includes(picked.type)) {
      setFileError('Only images (JPG, PNG) or PDF files are allowed.');
      setForm((f) => ({ ...f, discountIdFileObj: null }));
      return;
    }
    // A phone photo is shrunk first, so a 6 to 10 MB photo fits the 5 MB limit. The 5 MB rule below
    // still applies to what is actually sent.
    setPreparing(true);
    const file = await shrinkPhoto(picked);
    setPreparing(false);
    if (file.size > MAX_SIZE) {
      setFileError('File is too large. Max size is 5MB.');
      setForm((f) => ({ ...f, discountIdFileObj: null }));
      return;
    }
    setFileError('');
    setForm((f) => ({ ...f, discountIdFileObj: file }));
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
          {preparing && <p className="sdm-muted" role="status">Preparing photo...</p>}
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
