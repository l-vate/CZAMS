import { useState } from 'react';

import { formatPeso } from '../utils/bookingPricing';
import { needsReference, normalizeReference, referenceError, REFERENCE_MAX } from '../utils/paymentReference';
import { shrinkPhoto } from '../utils/photoShrink';

function PaymentModal({ form, paymentType = 'downpayment', paymentMethods = [], onClose, onSubmit }) {
  const basePrice = form.basePrice || 0;
  // The booking's stored down payment percent. No invented default: when it is missing the
  // percent shows as "Not set" and the amount comes from the stored figures only.
  const dpPercent = form.downPaymentPercent ?? null;
  const toPayNow = form.toPayNow ?? (dpPercent === null ? 0 : Math.round(basePrice * (dpPercent / 100)));
  const remaining = form.remaining ?? (basePrice - toPayNow);

  const isBalance = paymentType === 'balance';
  const amountDue = isBalance ? remaining : toPayNow;

  // A balance payment uses whatever mode was picked for the *second* payment when
  // the booking was made (paymentMode2) - form.paymentMode is the down payment's
  // mode and would be wrong here for e.g. a booking paid down via GCash but
  // settling its balance via Bank Transfer.
  const selectedModeName = isBalance ? form.paymentMode2 : form.paymentMode;
  const accountDetails = paymentMethods.find((m) => m.name === selectedModeName)?.accountDetails || [];

  const [proof, setProof] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

  // GCash and Bank Transfer need the proof file and the reference number together. Cash needs
  // neither. A booking with no mode on record keeps the old rule (proof required, no reference).
  const requiresReference = needsReference(selectedModeName);
  const proofRequired = requiresReference || !selectedModeName;
  const referenceProblem = requiresReference ? referenceError(referenceNumber) : '';
  const canSubmit = (!proofRequired || !!proof) && !referenceProblem && !preparing;

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  const handleProofChange = async (e) => {
    const picked = e.target.files[0];
    if (!picked) {
      setProof(null);
      setFileError('');
      return;
    }
    if (!ALLOWED_TYPES.includes(picked.type)) {
      setFileError('Only images (JPG, PNG) or PDF files are allowed.');
      setProof(null);
      return;
    }
    // A phone photo is shrunk first, so a 6 to 10 MB photo fits the 5 MB limit.
    setPreparing(true);
    const file = await shrinkPhoto(picked);
    setPreparing(false);
    if (file.size > MAX_SIZE) {
      setFileError('File is too large. Max size is 5MB.');
      setProof(null);
      return;
    }
    setFileError('');
    setProof(file);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h4 className="modal-title">{isBalance ? 'Settle Remaining Balance' : 'Cost Breakdown'}</h4>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-cost-rows">
          {form.lineItems?.map((li, i) => (
            <div className="modal-cost-row" key={i}>
              <span>{li.isDiscount ? li.type : `${li.type || '-'} × ${li.quantity}`}</span>
              <span>{formatPeso(li.subtotal)}.00</span>
            </div>
          ))}
          {form.discountAmount > 0 && !form.lineItems?.some((li) => li.isDiscount) && (
            <div className="modal-cost-row"><span>{form.discountLabel || 'Discount'}</span><span>{formatPeso(-form.discountAmount)}.00</span></div>
          )}
          <div className="modal-cost-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
          <div className="modal-cost-row"><span>Down Payment</span><span>{dpPercent === null ? 'Not set' : `${dpPercent}%`}</span></div>

          {isBalance ? (
            <div className="modal-cost-row"><span>Remaining Balance Due</span><span>₱{amountDue.toLocaleString()}.00</span></div>
          ) : (
            <>
              <div className="modal-cost-row"><span>Amount to Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
              <div className="modal-cost-row"><span>Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>
            </>
          )}

          <div className="modal-cost-row"><span>Payment Mode</span><span>{form.paymentMode || '-'}</span></div>
        </div>

        <div className="modal-divider" />

        {accountDetails.length > 0 && (
          <>
            <p className="modal-instruction">Send your payment to the account:</p>
            <div className="modal-account-box">
              {accountDetails.map((d, i) => (
                <div className="modal-account-row" key={i}><span>{d.label}</span><span>{d.value}</span></div>
              ))}
            </div>
          </>
        )}

        <div className="modal-upload-group">
          <label className="modal-upload-label">
            Upload your proof of payment here:
          </label>
          <label className="modal-file-btn">
            {proof ? proof.name : '[Choose a file]'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.pdf"
              className="payment-modal-x1"
              onChange={handleProofChange}
            />
          </label>
          {preparing && <p className="sdm-muted" role="status">Preparing photo...</p>}
          {fileError && (
            <p className="payment-modal-x2">
              {fileError}
            </p>
          )}
          {proofRequired && !proof && !fileError && (
            <p className="payment-modal-x2">
              Proof of payment is required to submit.
            </p>
          )}
        </div>

        {requiresReference && (
          <div className="modal-upload-group">
            <label className="modal-upload-label" htmlFor="payment-reference">
              Reference number of your {selectedModeName} payment:
            </label>
            <input
              id="payment-reference"
              type="text"
              className="bs-input"
              maxLength={REFERENCE_MAX}
              autoComplete="off"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. 1234567890"
            />
            {referenceProblem && referenceNumber !== '' && (
              <p className="payment-modal-x2">{referenceProblem}</p>
            )}
            {referenceNumber === '' && (
              <p className="payment-modal-x2">The reference number is required to submit.</p>
            )}
          </div>
        )}

        <button
          className="modal-submit-btn"
          onClick={() => onSubmit({ proof, referenceNumber: requiresReference ? normalizeReference(referenceNumber) : undefined })}
          disabled={!canSubmit}
        >
          SUBMIT
        </button>

      </div>
    </div>
  );
}

export default PaymentModal;