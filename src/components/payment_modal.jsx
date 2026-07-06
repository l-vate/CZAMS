import { useState } from 'react';

const SERVICES = [
  { id: 'cleaning', label: 'Cleaning', price: 650 },
  { id: 'repair', label: 'Repair', price: 1200 },
  { id: 'installation', label: 'Installation', price: 3500 },
  { id: 'maintenance', label: 'Maintenance', price: 550 },
];

function PaymentModal({ form, onClose, onSubmit }) {
  const selected = SERVICES.find((s) => s.id === form.service);
  const basePrice = selected?.price || 0;
  const dpPercent = form.downPaymentPercent ?? 10;
  const toPayNow = Math.round(basePrice * (dpPercent / 100));
  const remaining = basePrice - toPayNow;

  const [proof, setProof] = useState(null);
  const [senior, setSenior] = useState(null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h4 className="modal-title">Cost Breakdown</h4>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Summary rows */}
        <div className="modal-cost-rows">
          <div className="modal-cost-row"><span>Total Price</span><span>₱{basePrice.toLocaleString()}.00</span></div>
          <div className="modal-cost-row"><span>Down Payment</span><span>{dpPercent}%</span></div>
          <div className="modal-cost-row"><span>Amount to Pay Now</span><span>₱{toPayNow.toLocaleString()}.00</span></div>
          <div className="modal-cost-row"><span>Remaining Balance</span><span>₱{remaining.toLocaleString()}.00</span></div>
          <div className="modal-cost-row"><span>Payment Mode</span><span>{form.paymentMode || '—'}</span></div>
        </div>

        <div className="modal-divider" />

        {/* Account details */}
        <p className="modal-instruction">Send your payment to the account:</p>
        <div className="modal-account-box">
          <div className="modal-account-row"><span>Account Name</span><span>John Owner</span></div>
          <div className="modal-account-row"><span>Account Number</span><span>09xxxxxxxxx</span></div>
        </div>

        {/* Proof of payment upload */}
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
              onChange={(e) => setProof(e.target.files[0] || null)}
            />
          </label>
        </div>

        {/* PWD/Senior Citizen discount */}
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

        <button
          className="modal-submit-btn"
          onClick={() => onSubmit({ proof, senior })}
        >
          SUBMIT
        </button>

      </div>
    </div>
  );
}

export default PaymentModal;