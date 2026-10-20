import { useState } from 'react';
import { shrinkPhoto } from '../utils/photoShrink';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB, same rule as every other upload
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Optional Senior Citizen / PWD discount request, shared by the customer booking wizard, the "request after booking" form and the admin
// walk-in form. One tick box ("I am a Senior Citizen or PWD and I request the discount"), a choice of Senior Citizen or PWD, and, for a
// customer (idRequired), a photo of a valid ID that is always required. An admin booking on someone's behalf has seen the ID in person,
// so the upload is optional there and the discount is applied straight away. The owner checks the ID before approving.
// The form keeps the choice in form.discountType ('' when not requested, 'Senior' or 'PWD') and the photo in form.discountIdFileObj.
function DiscountOption({ form, setForm, idRequired, appliesNow, percent, optional = true }) {
  const [fileError, setFileError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const requested = Boolean(form.discountType);

  const toggle = (checked) => {
    setFileError('');
    setForm({ ...form, discountType: checked ? 'Senior' : '', discountIdFileObj: null });
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
          {fileError && <p className="discount-option-x3">{fileError}</p>}
          {idRequired && !form.discountIdFileObj && !fileError && (
            <p className="discount-option-x3">A photo of a valid ID is required to request this discount.</p>
          )}
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
