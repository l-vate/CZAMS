import { useEffect, useState } from 'react';
import { getMe } from '../services/userService';
import { documentTitle } from '../utils/receiptStatus';
import { ProofLink } from './proof_file';
import { BRAND_NAME, COMPANY_PHONE } from '../config/company';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

// The invoice (while something is still to pay) or the acknowledgment receipt (once fully paid).
// `billTo` is { companyName, representativeName } for a Commercial customer. Admin pages pass it
// from the booking's customer; on a customer page it is left out and read from their own account.
function ReceiptModal({ form, booking, billTo, onClose }) {
  const basePrice = form.basePrice || 0;
  // The booking's stored down payment percent. No invented default (see payment_modal.jsx).
  const dpPercent = form.downPaymentPercent ?? null;
  const toPayNow = form.toPayNow ?? (dpPercent === null ? 0 : Math.round(basePrice * (dpPercent / 100)));
  const remaining = form.remaining ?? (basePrice - toPayNow);
  const discountAmount = form.discountAmount || 0;
  const isFullyPaid = form.isFullyPaid;
  const title = documentTitle(isFullyPaid);

  const proofFile = booking?.proofFile || form.proofFile;
  const balanceProofFile = booking?.balanceProofFile || form.balanceProofFile;
  const referenceNumber = booking?.referenceNumber || form.referenceNumber;
  const balanceReferenceNumber = booking?.balanceReferenceNumber || form.balanceReferenceNumber;
  const paymentMode2 = booking?.paymentMode2 || form.paymentMode2;
  const balancePaid = booking?.balancePaid || form.balancePaid;
  const isSinglePayment = dpPercent === 100; // paid in full upfront, no separate balance stage
  const balanceDue = isFullyPaid || balancePaid || isSinglePayment ? 0 : remaining;

  // Commercial Client Procedures - VAT/PO/payment-terms only ever apply to a
  // walk-in booking made under a Commercial client account.
  const isCommercial = booking?.isCommercial || form.isCommercial;
  const vatAmount = booking?.vatAmount || form.vatAmount || 0;
  const poNumber = booking?.poNumber || form.poNumber;
  const paymentTermsDays = booking?.paymentTermsDays || form.paymentTermsDays;
  const paymentDueAt = booking?.paymentDueAt || form.paymentDueAt;
  const isBilledOnTerms = isCommercial && !!paymentTermsDays;

  // Company details of a Commercial customer. A customer page leaves `billTo` out, so their own
  // account is read once; accounts made before these fields existed simply have none.
  const [ownBillTo, setOwnBillTo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!isCommercial || billTo) return undefined;
    getMe()
      .then((me) => { if (!cancelled) setOwnBillTo({ companyName: me.companyName, representativeName: me.representativeName }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isCommercial, billTo]);
  const company = billTo || ownBillTo || {};

  useEffect(() => {
    document.body.classList.add('printing-receipt-active');
    return () => document.body.classList.remove('printing-receipt-active');
  }, []);

  const handlePrint = () => window.print();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <span />
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="receipt-print-area">
          <div className="receipt-top-row">
            <div className="receipt-brand">
              <img src="/images/logo.png" alt={`${BRAND_NAME} logo`} className="receipt-logo" />
              <div>
                <p className="receipt-brand-name">{BRAND_NAME}</p>
                <p className="receipt-brand-phone">Tel. {COMPANY_PHONE}</p>
              </div>
            </div>
            <div className="receipt-invoice-meta">
              <p className="receipt-invoice-title">{title}</p>
              <p>{isFullyPaid ? 'Receipt' : 'Invoice'} No.: {booking?.id || form.id}</p>
              <p>Date: {formatDate(booking?.createdAt || form.createdAt)}</p>
              {poNumber && <p>PO No.: {poNumber}</p>}
            </div>
          </div>

          <div className="receipt-section">
            <p className="receipt-section-title">{isCommercial ? 'Bill To' : 'Customer Information'}</p>
            {isCommercial && (
              <>
                <div className="receipt-info-row"><span>Company:</span><span>{company.companyName || 'Not recorded'}</span></div>
                <div className="receipt-info-row"><span>Representative:</span><span>{company.representativeName || 'Not recorded'}</span></div>
              </>
            )}
            <div className="receipt-info-row"><span>Customer Name:</span><span>{form.customerName || '-'}</span></div>
            <div className="receipt-info-row"><span>Address:</span><span>{form.address || '-'}</span></div>
            <div className="receipt-info-row"><span>Contact Number:</span><span>{form.contactNumber || '-'}</span></div>
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
                {form.lineItems?.length > 0 ? (
                  form.lineItems.filter((li) => !li.isDiscount).map((li, i) => (
                    <tr key={i}>
                      <td>{form.service || '-'} - {li.type || '-'}{li.brandModel ? ` (${li.brandModel})` : ''}{li.hp ? ` ${li.hp} HP` : ''}</td>
                      <td>{li.quantity}</td>
                      <td>₱{li.subtotal.toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td>{form.service || '-'}</td>
                    <td>1</td>
                    <td>₱{basePrice.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="receipt-section receipt-footer-info">

            {discountAmount > 0 && (
              <>
                <div className="receipt-info-row">
                  <span>Subtotal before discount</span>
                  <span>₱{(basePrice + discountAmount).toLocaleString()}</span>
                </div>
                <div className="receipt-info-row">
                  <span>{form.discountLabel || 'Discount'} (-₱{discountAmount.toLocaleString()})</span>
                  <span>-₱{discountAmount.toLocaleString()}</span>
                </div>
              </>
            )}

            {isCommercial ? (
              <>
                <div className="receipt-info-row">
                  <span>Subtotal</span>
                  <span>₱{basePrice.toLocaleString()}</span>
                </div>
                <div className="receipt-info-row">
                  <span>VAT (12%)</span>
                  <span>₱{vatAmount.toLocaleString()}</span>
                </div>
                <div className="receipt-info-row">
                  <span>Total incl. VAT</span>
                  <span>₱{(basePrice + vatAmount).toLocaleString()}</span>
                </div>
              </>
            ) : (
              <div className="receipt-info-row">
                <span>Total</span>
                <span>₱{basePrice.toLocaleString()}</span>
              </div>
            )}

            <div className="receipt-info-row">
              <span>Down payment{dpPercent === null ? '' : ` (${dpPercent}%)`}</span>
              <span>₱{toPayNow.toLocaleString()}</span>
            </div>

            <div className="receipt-info-row">
              <span>Balance due</span>
              <span>₱{balanceDue.toLocaleString()}</span>
            </div>

            {isBilledOnTerms && (
              <div className="receipt-info-row">
                <span>Payment Due</span>
                <span>
                  {paymentDueAt
                    ? formatDate(paymentDueAt)
                    : `${paymentTermsDays} days after completion`}
                </span>
              </div>
            )}

            <div className="receipt-info-row">
              <span>Payment Method</span>
              <span>{form.paymentMode || '-'}</span>
            </div>

            <div className="receipt-info-row">
              <span>Reference Number</span>
              <span>{referenceNumber || 'Not recorded'}</span>
            </div>

            <div className="receipt-info-row">
              <span>Proof of Payment</span>
              <span>
                {proofFile
                  ? <ProofLink path={proofFile}>View File</ProofLink>
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
                  <span>{paymentMode2 || '-'}</span>
                </div>
                <div className="receipt-info-row">
                  <span>Balance Reference Number</span>
                  <span>{balanceReferenceNumber || 'Not recorded'}</span>
                </div>
                {balanceProofFile && (
                  <div className="receipt-info-row">
                    <span>Balance Proof</span>
                    <span>
                      <ProofLink path={balanceProofFile}>View File</ProofLink>
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="receipt-info-row">
              <span>Status</span>
              <span className="receipt-status-paid">
                {isBilledOnTerms ? 'Billed on Terms' : isFullyPaid ? 'Fully Paid' : dpPercent === null ? 'Down payment not set' : `${dpPercent}% Paid`}
              </span>
            </div>

          </div>

          <p className="receipt-thanks">
            Thank you for choosing {BRAND_NAME}.
          </p>
        </div>

        <button className="modal-submit-btn receipt-print-btn" onClick={handlePrint}>
          🖨 Print {isFullyPaid ? 'Receipt' : 'Invoice'}
        </button>

      </div>
    </div>
  );
}

export default ReceiptModal;
