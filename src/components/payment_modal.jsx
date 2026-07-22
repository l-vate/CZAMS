import { useState } from 'react';

function PaymentModal({ form, paymentType = 'downpayment', onClose, onSubmit }) {
  const basePrice = form.basePrice || 0;
  const dpPercent = form.downPaymentPercent ?? 10;
  const toPayNow = form.toPayNow ?? Math.round(basePrice * (dpPercent / 100));
  const remaining = form.remaining ?? (basePrice - toPayNow);

  const isBalance = paymentType === 'balance';
  const amountDue = isBalance ? remaining : toPayNow;
  const amountLabel = isBalance ? 'Remaining Balance Due' : 'Amount to Pay Now';

  const [proof, setProof] = useState(null);
  const [senior, setSenior] = useState(null);
  const [fileError, setFileError] = useState('');

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  const handleProofChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setProof(null);
      setFileError('');
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Only images (JPG, PNG) or PDF files are allowed.');
      setProof(null);
      return;
    }
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
          <div className="modal-cost-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
          <div className="modal-cost-row"><span>Down Payment</span><span>{dpPercent}%</span></div>

          {isBalance ? (
            <div className="modal-cost-row"><span>Remaining Balance Due</span><span>₱{amountDue.toLocaleString()}.00</span></div>
          ) : (
            <>
              <div className="modal-cost-row"><span>Amount to Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
              <div className="modal-cost-row"><span>Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>
            </>
          )}

          <div className="modal-cost-row"><span>Payment Mode</span><span>{form.paymentMode || '—'}</span></div>
        </div>

        <div className="modal-divider" />

        <p className="modal-instruction">Send your payment to the account:</p>
        <div className="modal-account-box">
          <div className="modal-account-row"><span>Account Name</span><span>John Owner</span></div>
          <div className="modal-account-row"><span>Account Number</span><span>09xxxxxxxxx</span></div>
        </div>

        <div className="modal-upload-group">
          <label className="modal-upload-label">
            Upload your proof of payment here:
          </label>
          <label className="modal-file-btn">
            {proof ? proof.name : '[Choose a file]'}
            <input
              type="file"
              accept="image/*,.pdf"
              style={{ display: 'none' }}
              onChange={handleProofChange}
            />
          </label>
          {fileError && (
            <p style={{ fontSize: '11px', color: '#e05a5a', marginTop: '2px' }}>
              {fileError}
            </p>
          )}
          {!proof && !fileError && (
            <p style={{ fontSize: '11px', color: '#e05a5a', marginTop: '2px' }}>
              Proof of payment is required to submit.
            </p>
          )}
        </div>

        {!isBalance && (
          <div className="modal-upload-group">
            <label className="modal-upload-label">
              PWD/Senior Citizen <span className="modal-optional">(If Applicable):</span>
            </label>
            <label className="modal-file-btn">
              {senior ? senior.name : '[Choose a file]'}
              <input
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => setSenior(e.target.files[0] || null)}
              />
            </label>
          </div>
        )}

        <button
          className="modal-submit-btn"
          onClick={() => onSubmit({ proof, senior })}
          disabled={!proof}
        >
          SUBMIT
        </button>

      </div>
    </div>
  );
}

export default PaymentModal;