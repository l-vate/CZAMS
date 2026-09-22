import { useEffect } from 'react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

function ReceiptModal({ form, booking, onClose }) {
  const basePrice = form.basePrice || 0;
  const dpPercent = form.downPaymentPercent ?? 10;
  const toPayNow = form.toPayNow ?? Math.round(basePrice * (dpPercent / 100));
  const remaining = basePrice - toPayNow;
  const isFullyPaid = form.isFullyPaid;

  const proofFile = booking?.proofFile || form.proofFile;
  const balanceProofFile = booking?.balanceProofFile || form.balanceProofFile;
  const paymentMode2 = booking?.paymentMode2 || form.paymentMode2;
  const balancePaid = booking?.balancePaid || form.balancePaid;
  const isSinglePayment = dpPercent === 100; // paid in full upfront, no separate balance stage

  useEffect(() => {
    document.body.classList.add('printing-receipt-active');
    return () => document.body.classList.remove('printing-receipt-active');
  }, []);

  const handlePrint = () => window.print();

  return (
    <div className="modal-overlay receipt-modal-overlay" onClick={onClose}>
      <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header receipt-modal-header">
          <span />
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="receipt-print-area">
          <div className="receipt-top-row">
            <div className="receipt-brand">
              <span className="receipt-brand-icon">❄️</span>
              <div>
                <p className="receipt-brand-name">Cooling Zone Aircon</p>
                <p className="receipt-brand-sub">Services</p>
              </div>
            </div>
            <div className="receipt-invoice-meta">
              <p className="receipt-invoice-title">Invoice</p>
              <p>Invoice No.: {booking?.id || form.id}</p>
              <p>Date: {formatDate(booking?.createdAt || form.createdAt)}</p>
            </div>
          </div>

          <div className="receipt-section">
            <p className="receipt-section-title">Customer Information</p>
            <div className="receipt-info-row"><span>Customer Name:</span><span>{form.customerName || '—'}</span></div>
            <div className="receipt-info-row"><span>Address:</span><span>{form.address || '—'}</span></div>
            <div className="receipt-info-row"><span>Contact Number:</span><span>{form.contactNumber || '—'}</span></div>
          </div>

          <div className="receipt-section">
            <p className="receipt-section-title">Service Details</p>
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Description of Service</th>
                  <th>Quantity</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{form.service || '—'}</td>
                  <td>1</td>
                  <td>₱{basePrice.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="receipt-section receipt-footer-info">

            <div className="receipt-info-row">
              <span>Subtotal</span>
              <span>₱{basePrice.toLocaleString()}</span>
            </div>

            <div className="receipt-info-row">
              <span>Amount Paid</span>
              <span>₱{toPayNow.toLocaleString()}</span>
            </div>

            <div className="receipt-info-row">
              <span>Payment Method</span>
              <span>{form.paymentMode || '—'}</span>
            </div>

            <div className="receipt-info-row">
              <span>Proof of Payment</span>
              <span>
                {proofFile
                  ? <a href={`${import.meta.env.VITE_API_URL}${proofFile}`} target="_blank" rel="noopener noreferrer">View File</a>
                  : 'None'}
              </span>
            </div>

            {!isSinglePayment && balancePaid && (
              <>
                <div className="receipt-info-row">
                  <span>Balance Amount Paid</span>
                  <span>₱{remaining.toLocaleString()}</span>
                </div>
                <div className="receipt-info-row">
                  <span>Balance Payment Method</span>
                  <span>{paymentMode2 || '—'}</span>
                </div>
                {balanceProofFile && (
                  <div className="receipt-info-row">
                    <span>Balance Proof</span>
                    <span>
                      <a href={`${import.meta.env.VITE_API_URL}${balanceProofFile}`} target="_blank" rel="noopener noreferrer">View File</a>
                    </span>
                  </div>
                )}
              </>
            )}

            {!isSinglePayment && !balancePaid && (
              <div className="receipt-info-row">
                <span>Balance Due</span>
                <span>₱{remaining.toLocaleString()}</span>
              </div>
            )}

            <div className="receipt-info-row">
              <span>Status</span>
              <span className="receipt-status-paid">
                {isFullyPaid ? 'Fully Paid' : `${dpPercent}% Paid`}
              </span>
            </div>

          </div>

          <p className="receipt-thanks">
            Thank you for choosing Cooling Zone Aircon Services.
          </p>
        </div>

        <button className="modal-submit-btn receipt-print-btn" onClick={handlePrint}>
          🖨 Print Receipt
        </button>

      </div>
    </div>
  );
}

export default ReceiptModal;