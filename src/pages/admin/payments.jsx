import { useMemo, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import AdminLayout from './admin_layout';
import PersonFilterBanner from '../../components/person_filter_banner';
import PaymentReference from '../../components/payment_reference';
import ReceiptModal from '../../components/receipt_modal';
import { buildReceiptForm } from '../../utils/receiptData';
import { getBookingLineItems, getUnitsSummary } from '../../utils/bookingPricing';
import { getMemberNames } from '../../utils/assignments';
import { getFilterPillStyle } from '../../utils/statusColors';
import { usePaymentSettings, getDefaultDownPaymentPercent } from '../../utils/paymentSettings';
import { withFallback } from '../../services/apiClient';
import { listBookings, adminUpdateBooking } from '../../services/bookingService';
import { processRefund, resolveRefundFlag } from '../../services/refundService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } from '../../constants/paymentStatus';
import { REFUND_STATUS } from '../../constants/refundStatus';
import { ProofLink, ProofImage } from '../../components/proof_file';


function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Shared icons ──────────────────────────────────────── */
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="icon-clock" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function StatusBadge({ status, meta }) {
  const m = meta[status];
  if (!m) return null;
  return <span className={m.className}>{m.label}</span>;
}

/* =====================================================================
   PAYMENTS PANEL
   ===================================================================== */
const PAYMENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'to_verify', label: 'To Verify' },
  { key: 'partially_paid', label: 'Partially Paid' },
  { key: 'fully_paid', label: 'Fully Paid' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'refund', label: 'Refunds' },
];

const PAYMENT_STATUS_META = {
  unpaid: { label: 'Unpaid', className: 'status-pill status-pill--unpaid' },
  to_verify: { label: 'To Verify', className: 'status-pill status-pill--verify' },
  partially_paid: { label: 'Partially Paid', className: 'status-pill status-pill--partial' },
  fully_paid: { label: 'Fully Paid', className: 'status-pill status-pill--full' },
  rejected: { label: 'Rejected', className: 'status-pill status-pill--rejected' },
  balance_rejected: { label: 'Balance Rejected', className: 'status-pill status-pill--rejected' },
  // Once a booking is cancelled, paymentStatus reflects whatever it happened to be
  // right before cancellation and no longer means what it used to - these three
  // override it so the badge reflects the booking's actual current state instead.
  refunded: { label: 'Refunded', className: 'status-pill status-pill--refunded' },
  cancelled: { label: 'Cancelled', className: 'status-pill status-pill--cancelled' },
  cancelled_refund_pending: { label: 'Cancelled – Refund Pending', className: 'status-pill status-pill--cancelled' },
  // A warranty repair visit (back job) is free: nothing to collect or verify. Shown
  // only under "All", same as the customer's Payment & Billing page.
  free_back_job: { label: 'Free (Back Job)', className: 'status-pill status-pill--full' },
};

// Terminal states where there's nothing left to review - reviewing/approving a
// cancelled booking's stale payment proof would either error out server-side
// (admin-update blocks edits on cancelled bookings) or be actively misleading.
const TERMINAL_PAYMENT_STATUSES = ['cancelled', 'cancelled_refund_pending', 'refunded', 'free_back_job'];

/* ── Review Request Modal ──────────────────────────────── */
function ReviewRequestModal({ payment, onClose, onSuccess }) {
  const { downPaymentPercentages } = usePaymentSettings();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!payment) return null;

  const isPdf = payment.attachmentUrl?.toLowerCase().endsWith('.pdf');

  const handleUpdatePaymentStatus = async (status) => {
    setSubmitting(true);
    setError('');

    try {
      const isBalanceProof = Boolean(payment.raw?.balanceProofFile && payment.raw?.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY);
      const isRejecting = status === PAYMENT_STATUS.REJECTED;

      // Decide target statuses based on whether it's a balance proof or down payment proof,
      // and whether this is an approval or a rejection. Rejecting a balance proof must NOT
      // mark it paid - each track (down payment / balance) is rejected or approved independently.
      const payload = isBalanceProof
        ? (isRejecting
            ? { balancePaymentStatus: BALANCE_PAYMENT_STATUS.REJECTED }
            : { balancePaymentStatus: BALANCE_PAYMENT_STATUS.PAID, balancePaid: true })
        : { paymentStatus: status }; // status can be 'partially_paid', 'fully_paid', or 'rejected'

      await adminUpdateBooking(payment.bookingId, payload).catch(withFallback('Failed to update payment status.'));

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error updating payment status:', err);
      setError(err.message || 'Network error while processing request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card payment-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header admin-payments-x1">
          <h4 className="modal-title">Review Payment Request</h4>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </button>
        </div>

        <p className="payment-review-booking">
          {payment.serviceType} · {payment.bookingId}
        </p>

        {error && (
          <p className="admin-payments-x2">{error}</p>
        )}

        <div
          className="payment-review-grid admin-payments-x3"
        >
          <div className="payment-review-cell admin-payments-x4">
            <span className="confirmation-detail-label">Client</span>
            <span className="confirmation-detail-value">{payment.clientName}</span>
          </div>

          <div className="payment-review-cell admin-payments-x4">
            <span className="confirmation-detail-label">Technician</span>
            <span className="confirmation-detail-value">{payment.technician}</span>
          </div>

          <div className="payment-review-cell admin-payments-x4">
            <span className="confirmation-detail-label">Date &amp; Time</span>
            <span className="confirmation-detail-value">{payment.date}, {payment.time}</span>
          </div>

          <div className="payment-review-cell admin-payments-x4">
            <span className="confirmation-detail-label">Amount</span>
            <span className="confirmation-detail-value">{payment.amount}</span>
          </div>

          <div className="payment-review-cell admin-payments-x4">
            <span className="confirmation-detail-label">Status</span>
            <span className="confirmation-detail-value"><StatusBadge status={payment.status} meta={PAYMENT_STATUS_META} /></span>
          </div>
        </div>

        <div className="payment-review-cell admin-payments-x4">
          <span className="confirmation-detail-label">Reference Number</span>
          <span className="confirmation-detail-value"><PaymentReference booking={payment.raw} /></span>
        </div>

        <div className="payment-review-attachment-section admin-payments-x5">
          <span className="confirmation-detail-label">Attached File</span>
          {payment.hasAttachment ? (
            payment.attachmentUrl ? (
              isPdf ? (
                <div className="admin-payments-x6">
                  <p className="admin-payments-x7">PDF Document Attached</p>
                  <ProofLink path={payment.attachmentUrl} className="admin-payments-x8">
                    📄 View PDF Proof
                  </ProofLink>
                </div>
              ) : (
                <ProofLink path={payment.attachmentUrl}>
                  <ProofImage
                    path={payment.attachmentUrl}
                    alt="Payment proof"
                    className="payment-review-attachment-img admin-payments-x9"
                  />
                </ProofLink>
              )
            ) : (
              <div
                className="payment-review-attachment-placeholder admin-payments-x10"
              >
                <FileIcon />
                <span className="admin-payments-x11">proof_of_payment_{payment.bookingId}</span>
              </div>
            )
          ) : (
            <div
              className="payment-review-attachment-placeholder payment-review-attachment-placeholder--empty admin-payments-x12"
            >
              No file was attached to this request.
            </div>
          )}
        </div>


          <div className="cancel-confirm-actions admin-payments-x13">
          <button
            type="button"
            className="cancel-booking-btn"
            onClick={() => handleUpdatePaymentStatus(PAYMENT_STATUS.REJECTED)}
            disabled={submitting}
          >
            {submitting ? 'Processing...' : 'Reject'}
          </button>
          <button
            type="button"
            className="bs-next-btn"
            onClick={() => {
              // Automatically check if it's 100% full payment or partial payment
              const dpPercent = payment.raw?.downPaymentPercent ?? getDefaultDownPaymentPercent(downPaymentPercentages);
              if (dpPercent === null) {
                // Neither the booking nor the payment settings say what the down payment is: do not guess.
                setError('The down payment percent is not set for this booking and the payment settings could not be loaded. Try again later.');
                return;
              }
              const targetStatus = dpPercent === 100 ? PAYMENT_STATUS.FULLY_PAID : PAYMENT_STATUS.PARTIALLY_PAID;
              handleUpdatePaymentStatus(targetStatus);
            }}
            disabled={submitting}
          >
            {submitting ? 'Processing...' : 'Approve'}
          </button>
        </div>

      </div>
    </div>
  );
}

function PaymentCard({ payment, onReviewRequest, onReviewRefund, onViewInvoice }) {
  const isFlagged = Boolean(payment.refund?.customerFlag?.flagged && !payment.refund?.customerFlag?.resolved);
  const isPendingRefund = payment.status === 'cancelled_refund_pending';
  const isProcessedRefund = payment.status === 'refunded';

  return (
    <div className="payment-card">
      <div className="payment-card__main">
        <div className="payment-card__header">
          <span className="payment-card__client">{payment.clientName}</span>
          <span className="payment-card__dash">–</span>
          <StatusBadge status={payment.status} meta={PAYMENT_STATUS_META} />
          {isFlagged && <span className="refund-card__flag-tag">Flagged</span>}
        </div>
        <div className="payment-card__service">
          <span className="payment-card__service-type">{payment.serviceType}</span>
          <span className="payment-card__dot">·</span>
          <span className="payment-card__detail">{payment.detail}</span>
        </div>
        <div className="payment-card__booking">{payment.bookingId}</div>
        <div className="payment-card__technician">Technician: {payment.technician}</div>
      </div>

      <div className="payment-card__amount">{payment.amount}</div>

      <div className="payment-card__datetime">
        <ClockIcon />
        <span>{payment.date} {payment.time}</span>
      </div>

      <div className="payment-card__attachment">
        <ClockIcon />
        <span className={`payment-card__link ${payment.hasAttachment ? '' : 'payment-card__link--muted'}`}>
          {payment.hasAttachment ? 'Attached file' : 'No file'}
        </span>
      </div>

      <div className="payment-card__action">
        <button
          type="button"
          className="payment-card__link payment-card__review-btn"
          onClick={() => onViewInvoice(payment)}
        >
          Invoice
        </button>
        {isPendingRefund || isProcessedRefund ? (
          <button
            type="button"
            className="payment-card__link payment-card__review-btn"
            onClick={() => onReviewRefund(payment)}
          >
            {isFlagged ? 'Review Flag' : isPendingRefund ? 'Review Refund' : 'View Refund'}
          </button>
        ) : (
          !TERMINAL_PAYMENT_STATUSES.includes(payment.status) && (
            <button
              type="button"
              className="payment-card__link payment-card__review-btn"
              onClick={() => onReviewRequest(payment)}
            >
              Review Request
            </button>
          )
        )}
      </div>
    </div>
  );
}

function PaymentsPanel({ personFilter, onClearPersonFilter, search = '' }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [invoicePayment, setInvoicePayment] = useState(null);
  const [rawBookings, setRawBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const data = await listBookings();
      setRawBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const paymentsList = useMemo(() => {
    return rawBookings.map((b) => {
      const clientName = typeof b.customer === 'object' ? (b.customer?.name || 'Customer') : (b.customerName || 'Customer');
      const technician = getMemberNames(b);
      const serviceType = typeof b.service === 'object' ? (b.service?.name || 'Service') : (b.service || 'Service');
      const detail = getUnitsSummary(b) || b.brandModel || b.problemDescription || 'Detail';

      const { basePrice } = getBookingLineItems(b);

      let status;
      if (b.isBackJob) {
        status = 'free_back_job';
      } else if (b.refund?.status === REFUND_STATUS.PROCESSED) {
        status = 'refunded';
      } else if (b.status === BOOKING_STATUS.CANCELLED) {
        status = b.refund?.status === REFUND_STATUS.PENDING ? 'cancelled_refund_pending' : 'cancelled';
      } else if (b.paymentStatus === PAYMENT_STATUS.REJECTED) {
        status = 'rejected';
      } else if (b.paymentStatus === PAYMENT_STATUS.FULLY_PAID || b.balancePaid || b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.PAID) {
        status = 'fully_paid';
      } else if (b.paymentStatus === PAYMENT_STATUS.PARTIALLY_PAID) {
        if (b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.REJECTED) status = 'balance_rejected';
        else if (b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY) status = 'to_verify';
        else status = 'partially_paid';
      } else if (b.paymentStatus === PAYMENT_STATUS.TO_VERIFY) {
        status = 'to_verify';
      } else {
        status = 'unpaid';
      }

      const proofFile = b.balancePaymentStatus === BALANCE_PAYMENT_STATUS.TO_VERIFY
        ? (b.balanceProofFile || b.proofFile)
        : (b.proofFile || b.balanceProofFile);
      // the stored path (or an external link); the review window asks the server for a signed link
      const attachmentUrl = proofFile || null;

      return {
        id: b._id || b.bookingId,
        bookingId: b.bookingId,
        clientName,
        serviceType,
        detail,
        technician,
        date: b.date || 'N/A',
        time: b.time || 'N/A',
        status,
        hasAttachment: Boolean(attachmentUrl),
        attachmentUrl,
        amount: b.isBackJob ? 'Free' : `₱${basePrice.toLocaleString()}`,
        refund: b.refund && b.refund.status !== REFUND_STATUS.NONE ? b.refund : null,
        raw: b,
      };
    });
  }, [rawBookings]);

  const filteredPayments = useMemo(() => {
    return paymentsList.filter((payment) => {
      const matchesFilter =
        activeFilter === 'all' ||
        payment.status === activeFilter ||
        (activeFilter === 'rejected' && payment.status === 'balance_rejected') ||
        (activeFilter === 'refund' && (payment.status === 'refunded' || payment.status === 'cancelled_refund_pending'));
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        payment.clientName.toLowerCase().includes(query) ||
        payment.bookingId.toLowerCase().includes(query);
      // Billing History (Manage Accounts, client accounts) - this panel only ever
      // receives a 'customer' person filter, never 'technician'.
      const matchesPerson = !personFilter || payment.raw?.customer?._id === personFilter.id;
      return matchesFilter && matchesSearch && matchesPerson;
    });
  }, [paymentsList, activeFilter, search, personFilter]);

  const handleReviewRequest = (payment) => {
    setSelectedPayment(payment);
  };

  const handleReviewRefund = (payment) => {
    // RefundReviewModal expects the raw refund shape (status: 'Pending'/'Processed',
    // not the payment card's derived 'refunded'/'cancelled_refund_pending' status).
    setSelectedRefund({
      id: payment.id,
      bookingId: payment.bookingId,
      clientName: payment.clientName,
      serviceType: payment.serviceType,
      ...payment.refund,
    });
  };

  return (
    <>
      <div className="payments-toolbar">
        <div className="payments-filters">
          {PAYMENT_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${activeFilter === filter.key ? 'filter-pill--active' : ''}`}
              style={getFilterPillStyle(filter.key, activeFilter === filter.key)}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <PersonFilterBanner filter={personFilter} onClear={onClearPersonFilter} />

      {loading ? (
        <div className="payments-empty">Loading payment requests...</div>
      ) : (
        <div className="payments-list">
          {filteredPayments.length === 0 ? (
            <div className="payments-empty">No payment requests match your search.</div>
          ) : (
            filteredPayments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onReviewRequest={handleReviewRequest}
                onReviewRefund={handleReviewRefund}
                onViewInvoice={setInvoicePayment}
              />
            ))
          )}
        </div>
      )}

      {selectedPayment && (
        <ReviewRequestModal
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onSuccess={fetchBookings}
        />
      )}

      {selectedRefund && (
        <RefundReviewModal
          refund={selectedRefund}
          onClose={() => setSelectedRefund(null)}
          onSuccess={fetchBookings}
        />
      )}

      {invoicePayment && (
        <ReceiptModal
          form={buildReceiptForm(invoicePayment.raw, {
            customerName: invoicePayment.raw.customer?.name,
            contactNumber: invoicePayment.raw.contactNumber || invoicePayment.raw.customer?.phone,
          })}
          booking={invoicePayment.raw}
          billTo={{
            companyName: invoicePayment.raw.customer?.companyName,
            representativeName: invoicePayment.raw.customer?.representativeName,
          }}
          onClose={() => setInvoicePayment(null)}
        />
      )}
    </>
  );
}

/* =====================================================================
   REFUNDS - folded back into the Payments tab as a "Refunds" filter pill
   (PaymentCard/handleReviewRefund above) rather than its own top-level page.
   RefundReviewModal below is still used for that review action.
   ===================================================================== */
// Reuses the existing status-pill color language: amber for "awaiting admin action",
// green for "done" - same as PAYMENT_STATUS_META's to_verify/fully_paid colors.
const REFUND_STATUS_META = {
  Pending: { label: 'Pending', className: 'status-pill status-pill--verify' },
  Processed: { label: 'Processed', className: 'status-pill status-pill--full' },
};

/* ── Refund Review Modal ──────────────────────────────── */
function RefundReviewModal({ refund, onClose, onSuccess }) {
  const [dispatchDeduction, setDispatchDeduction] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [proof, setProof] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingFlag, setResolvingFlag] = useState(false);
  const [error, setError] = useState('');

  if (!refund) return null;

  const isPending = refund.status === REFUND_STATUS.PENDING;
  const isFlagged = Boolean(refund.customerFlag?.flagged && !refund.customerFlag?.resolved);
  const deductionNum = Number(dispatchDeduction) || 0;
  const previewRefundable = refund.isSameDay
    ? Math.max(refund.downPaymentAmount - deductionNum, 0)
    : refund.downPaymentAmount;
  // The admin may refund less than the computed amount, never more than the customer paid.
  const finalNum = finalAmount === '' ? previewRefundable : Number(finalAmount);
  const isAdjusted = finalAmount !== '' && finalNum !== previewRefundable;
  const adjustmentReasonText = adjustmentReason.trim();

  const handleProcess = async () => {
    if (finalAmount !== '' && (isNaN(finalNum) || finalNum < 0 || finalNum > refund.downPaymentAmount)) {
      setError(`The refund must be between ₱0 and the ₱${refund.downPaymentAmount?.toLocaleString()} the customer paid.`);
      return;
    }
    if (isAdjusted && (adjustmentReasonText.length < 3 || adjustmentReasonText.length > 300)) {
      setError('Give a reason of 3 to 300 characters for changing the refund amount.');
      return;
    }
    if (refund.isSameDay && (dispatchDeduction === '' || isNaN(Number(dispatchDeduction)) || Number(dispatchDeduction) < 0)) {
      setError('Enter a valid dispatch/transportation deduction amount.');
      return;
    }
    if (!proof) {
      setError('Attach proof that the refund was sent before marking it processed.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await processRefund(refund.bookingId, {
        proof,
        dispatchDeduction: refund.isSameDay ? deductionNum : undefined,
        finalAmount: isAdjusted ? finalNum : undefined,
        adjustmentReason: isAdjusted ? adjustmentReasonText : undefined,
}).catch(withFallback('Failed to process refund.'));

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error processing refund:', err);
      setError(err.message || 'Network error while processing refund.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveFlag = async () => {
    setResolvingFlag(true);
    setError('');
    try {
      await resolveRefundFlag(refund.bookingId).catch(withFallback('Failed to resolve flag.'));
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error resolving refund flag:', err);
      setError(err.message || 'Network error while resolving flag.');
    } finally {
      setResolvingFlag(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card payment-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header admin-payments-x1">
          <h4 className="modal-title">{isPending ? 'Review Refund Request' : 'Refund Details'}</h4>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting || resolvingFlag}>
            <CloseIcon />
          </button>
        </div>

        <p className="payment-review-booking">{refund.serviceType} · {refund.bookingId}</p>

        {error && (
          <p className="admin-payments-x2">{error}</p>
        )}

        {isFlagged && (
          <div className="refund-flag-notice">
            <strong>Customer flagged this refund:</strong> "{refund.customerFlag.message}"
            <div className="refund-flag-notice-time">{formatDate(refund.customerFlag.flaggedAt)}</div>
          </div>
        )}

        <div className="payment-review-grid">
          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Client</span>
            <span className="confirmation-detail-value">{refund.clientName}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Cancellation Type</span>
            <span className="confirmation-detail-value">{refund.isSameDay ? 'Same-day' : 'Pre-service'}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Down Payment</span>
            <span className="confirmation-detail-value">₱{refund.downPaymentAmount?.toLocaleString()}</span>
          </div>

          <div className="payment-review-cell">
            <span className="confirmation-detail-label">Status</span>
            <span className="confirmation-detail-value"><StatusBadge status={refund.status} meta={REFUND_STATUS_META} /></span>
          </div>
        </div>

        {refund.isSameDay && isPending && (
          <div className="bs-field-group">
            <label className="bs-label">Dispatch / Transportation Deduction (₱)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="bs-input"
              placeholder="0.00"
              value={dispatchDeduction}
              onChange={(e) => setDispatchDeduction(e.target.value)}
            />
          </div>
        )}

        {refund.isSameDay && !isPending && (
          <div className="payment-review-cell admin-payments-x14">
            <span className="confirmation-detail-label">Dispatch / Transportation Deduction</span>
            <span className="confirmation-detail-value">₱{refund.dispatchDeduction?.toLocaleString()}</span>
          </div>
        )}

        <div className="payment-review-cell admin-payments-x15">
          <span className="confirmation-detail-label">
            {isPending ? 'Refundable Amount' : 'Refunded Amount'}
          </span>
          <span className="confirmation-detail-value">
            ₱{(isPending ? previewRefundable : refund.refundableAmount)?.toLocaleString()}
          </span>
        </div>

        {isPending && (
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="refund-final-amount">Amount to refund (₱) <span className="bs-label-hint">(Optional, leave blank to refund the amount above)</span></label>
            <input
              id="refund-final-amount"
              type="number"
              min="0"
              max={refund.downPaymentAmount}
              step="0.01"
              className="bs-input"
              placeholder={String(previewRefundable)}
              value={finalAmount}
              onChange={(e) => setFinalAmount(e.target.value)}
            />
            {isAdjusted && (
              <>
                <label className="bs-label" htmlFor="refund-adjust-reason">Reason for the change</label>
                <textarea
                  id="refund-adjust-reason"
                  className="bs-textarea"
                  rows={2}
                  maxLength={300}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                />
              </>
            )}
          </div>
        )}

        {isPending && (
          <div className="modal-upload-group">
            <label className="modal-upload-label">Proof the refund was sent</label>
            <label className="modal-file-btn">
              {proof ? proof.name : '[Choose a file]'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,.pdf"
                className="admin-payments-x16"
                onChange={(e) => setProof(e.target.files[0] || null)}
              />
            </label>
            {!proof && (
              <p className="admin-payments-x17">
                Required before this refund can be marked processed.
              </p>
            )}
          </div>
        )}

        {!isPending && refund.adjustmentReason && (
          <div className="payment-review-cell admin-payments-x14">
            <span className="confirmation-detail-label">
              Adjusted from ₱{refund.computedAmount?.toLocaleString()} to ₱{refund.finalAmount?.toLocaleString()} on {formatDate(refund.adjustedAt)}
            </span>
            <span className="confirmation-detail-value">{refund.adjustmentReason}</span>
          </div>
        )}

        {!isPending && (
          <div className="payment-review-cell admin-payments-x14">
            <span className="confirmation-detail-label">Customer confirmation</span>
            <span className="confirmation-detail-value">
              {refund.receivedConfirmedAt ? `Received, confirmed on ${formatDate(refund.receivedConfirmedAt)}` : 'Not confirmed yet'}
            </span>
          </div>
        )}

        {!isPending && refund.proofFile && (
          <div className="payment-review-cell admin-payments-x14">
            <span className="confirmation-detail-label">Proof of Refund</span>
            <ProofLink path={refund.proofFile} className="sdm-link">View File</ProofLink>
          </div>
        )}

        {isPending ? (
          <div className="cancel-confirm-actions">
            <button type="button" className="bs-back-btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="bs-next-btn" onClick={handleProcess} disabled={submitting || !proof}>
              {submitting ? 'Processing...' : 'Mark as Processed'}
            </button>
          </div>
        ) : isFlagged ? (
          <div className="cancel-confirm-actions">
            <button type="button" className="bs-back-btn" onClick={onClose} disabled={resolvingFlag}>
              Close
            </button>
            <button type="button" className="bs-next-btn" onClick={handleResolveFlag} disabled={resolvingFlag}>
              {resolvingFlag ? 'Saving...' : 'Mark Flag as Resolved'}
            </button>
          </div>
        ) : (
          <button type="button" className="bs-next-btn admin-payments-x18" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   MAIN - Refunds folded back into this page as a filter pill (see above);
   no longer its own top-level route.
   ===================================================================== */
function Payments() {
  const location = useLocation();
  // Manage Accounts' "Billing History" (client accounts) lands here with a person
  // filter pre-applied via navigation state.
  const [personFilter, setPersonFilter] = useState(location.state?.personFilter || null);
  const [search, setSearch] = useState('');

  return (
    <AdminLayout
      title="Payments"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name, booking id..."
    >
      <h1 className="dashboard-welcome">Payments</h1>
      <PaymentsPanel
        personFilter={personFilter}
        onClearPersonFilter={() => setPersonFilter(null)}
        search={search}
      />
    </AdminLayout>
  );
}

export default Payments;
