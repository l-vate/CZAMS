import { useMemo, useState, useEffect } from 'react';
import AdminLayout from './admin_layout';
import { FiSearch } from 'react-icons/fi';

const API_BASE = 'http://localhost:5000';

const TOP_TABS = [
  { key: 'payments', label: 'Payments' },
  { key: 'refunds', label: 'Refunds' },
];

function formatDate(dateStr) {
  if (!dateStr) return '—';
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

function SearchIcon() {
  return <FiSearch className="icon-search" aria-hidden="true" />;
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
];

const PAYMENT_STATUS_META = {
  unpaid: { label: 'Unpaid', className: 'status-pill status-pill--unpaid' },
  to_verify: { label: 'To Verify', className: 'status-pill status-pill--verify' },
  partially_paid: { label: 'Partially Paid', className: 'status-pill status-pill--partial' },
  fully_paid: { label: 'Fully Paid', className: 'status-pill status-pill--full' },
  rejected: { label: 'Rejected', className: 'status-pill status-pill--rejected' },
  balance_rejected: { label: 'Balance Rejected', className: 'status-pill status-pill--rejected' },
  // Once a booking is cancelled, paymentStatus reflects whatever it happened to be
  // right before cancellation and no longer means what it used to — these three
  // override it so the badge reflects the booking's actual current state instead.
  refunded: { label: 'Refunded', className: 'status-pill status-pill--refunded' },
  cancelled: { label: 'Cancelled', className: 'status-pill status-pill--cancelled' },
  cancelled_refund_pending: { label: 'Cancelled – Refund Pending', className: 'status-pill status-pill--cancelled' },
};

// Terminal states where there's nothing left to review — reviewing/approving a
// cancelled booking's stale payment proof would either error out server-side
// (admin-update blocks edits on cancelled bookings) or be actively misleading.
const TERMINAL_PAYMENT_STATUSES = ['cancelled', 'cancelled_refund_pending', 'refunded'];

/* ── Review Request Modal ──────────────────────────────── */
function ReviewRequestModal({ payment, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!payment) return null;

  const handleUpdatePaymentStatus = async (status) => {
    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const isBalanceProof = Boolean(payment.raw?.balanceProofFile && payment.raw?.balancePaymentStatus === 'to_verify');
      const isRejecting = status === 'rejected';

      // Decide target statuses based on whether it's a balance proof or down payment proof,
      // and whether this is an approval or a rejection. Rejecting a balance proof must NOT
      // mark it paid — each track (down payment / balance) is rejected or approved independently.
      const payload = isBalanceProof
        ? (isRejecting
            ? { balancePaymentStatus: 'rejected' }
            : { balancePaymentStatus: 'paid', balancePaid: true })
        : { paymentStatus: status }; // status can be 'partially_paid', 'fully_paid', or 'rejected'

      const res = await fetch(
        `${API_BASE}/api/bookings/${payment.bookingId}/admin-update`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update payment status.');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error updating payment status:', err);
      setError(err.message || 'Network error while processing request.');
    } finally {
      setSubmitting(false);
    }
  };

  const isPdf = payment.attachmentUrl?.toLowerCase().endsWith('.pdf');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card payment-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: '4px' }}>
          <h4 className="modal-title">Review Payment Request</h4>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </button>
        </div>

        <p className="payment-review-booking" style={{ margin: '2px 0 16px', color: '#6b7280', fontSize: '14px' }}>
          {payment.serviceType} · {payment.bookingId}
        </p>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
        )}

        <div
          className="payment-review-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px 20px',
            marginBottom: '20px',
          }}
        >
          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Client</span>
            <span className="confirmation-detail-value">{payment.clientName}</span>
          </div>

          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Technician</span>
            <span className="confirmation-detail-value">{payment.technician}</span>
          </div>

          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Date &amp; Time</span>
            <span className="confirmation-detail-value">{payment.date}, {payment.time}</span>
          </div>

          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Amount</span>
            <span className="confirmation-detail-value">{payment.amount}</span>
          </div>

          <div className="payment-review-cell" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-detail-label">Status</span>
            <span className="confirmation-detail-value"><StatusBadge status={payment.status} meta={PAYMENT_STATUS_META} /></span>
          </div>
        </div>

        <div className="payment-review-attachment-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          <span className="confirmation-detail-label">Attached File</span>
          {payment.hasAttachment ? (
            payment.attachmentUrl ? (
              isPdf ? (
                <div style={{ textAlign: 'center', padding: '16px', border: '1px dashed #d1d5db', borderRadius: '8px' }}>
                  <p style={{ fontSize: '13px', color: '#374151', marginBottom: '10px' }}>PDF Document Attached</p>
                  <a
                    href={payment.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      background: '#2563eb',
                      color: '#fff',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: '600',
                    }}
                  >
                    📄 View PDF Proof
                  </a>
                </div>
              ) : (
                <a href={payment.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={payment.attachmentUrl}
                    alt="Payment proof"
                    className="payment-review-attachment-img"
                    style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                </a>
              )
            ) : (
              <div
                className="payment-review-attachment-placeholder"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '24px 16px',
                  border: '1px dashed #d1d5db',
                  borderRadius: '8px',
                  color: '#6b7280',
                  textAlign: 'center',
                }}
              >
                <FileIcon />
                <span style={{ fontWeight: 600, fontSize: '14px' }}>proof_of_payment_{payment.bookingId}</span>
              </div>
            )
          ) : (
            <div
              className="payment-review-attachment-placeholder payment-review-attachment-placeholder--empty"
              style={{
                padding: '16px',
                border: '1px dashed #d1d5db',
                borderRadius: '8px',
                color: '#9ca3af',
                fontSize: '14px',
                textAlign: 'center',
              }}
            >
              No file was attached to this request.
            </div>
          )}
        </div>


          <div className="cancel-confirm-actions" style={{ marginTop: '4px' }}>
          <button
            type="button"
            className="cancel-booking-btn"
            onClick={() => handleUpdatePaymentStatus('rejected')} // Changed 'Rejected' to 'rejected'
            disabled={submitting}
          >
            {submitting ? 'Processing...' : 'Reject'}
          </button>
          <button
            type="button"
            className="bs-next-btn"
            onClick={() => {
              // Automatically check if it's 100% full payment or partial payment
              const dpPercent = payment.raw?.downPaymentPercent ?? 10;
              const targetStatus = dpPercent === 100 ? 'fully_paid' : 'partially_paid';
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

function PaymentCard({ payment, onReviewRequest }) {
  return (
    <div className="payment-card">
      <div className="payment-card__main">
        <div className="payment-card__header">
          <span className="payment-card__client">{payment.clientName}</span>
          <span className="payment-card__dash">–</span>
          <StatusBadge status={payment.status} meta={PAYMENT_STATUS_META} />
        </div>
        <div className="payment-card__service">
          <span className="payment-card__service-type">{payment.serviceType}</span>
          <span className="payment-card__dot">·</span>
          <span className="payment-card__detail">{payment.detail}</span>
        </div>
        <div className="payment-card__booking">{payment.bookingId}</div>
        <div className="payment-card__technician">Technician: {payment.technician}</div>
      </div>

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
        {!TERMINAL_PAYMENT_STATUSES.includes(payment.status) && (
          <button
            type="button"
            className="payment-card__link payment-card__review-btn"
            onClick={() => onReviewRequest(payment)}
          >
            Review Request
          </button>
        )}
      </div>
    </div>
  );
}

function PaymentsPanel() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [rawBookings, setRawBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch bookings');
      const data = await res.json();
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
      const technician = typeof b.technician === 'object' ? (b.technician?.name || 'Unassigned') : (b.technician || 'Unassigned');
      const serviceType = typeof b.service === 'object' ? (b.service?.name || 'Service') : (b.service || 'Service');
      const detail = b.brandModel || b.unitTypes || b.problemDescription || 'Detail';

      const basePrice = b.service?.price || b.basePrice || 0;

      let status = 'unpaid';
      if (b.refund?.status === 'Processed') {
        status = 'refunded';
      } else if (b.status === 'Cancelled') {
        status = b.refund?.status === 'Pending' ? 'cancelled_refund_pending' : 'cancelled';
      } else if (b.paymentStatus === 'rejected') {
        status = 'rejected';
      } else if (b.paymentStatus === 'fully_paid' || b.balancePaid || b.balancePaymentStatus === 'paid') {
        status = 'fully_paid';
      } else if (b.paymentStatus === 'partially_paid') {
        if (b.balancePaymentStatus === 'rejected') status = 'balance_rejected';
        else if (b.balancePaymentStatus === 'to_verify') status = 'to_verify';
        else status = 'partially_paid';
      } else if (b.paymentStatus === 'to_verify') {
        status = 'to_verify';
      } else {
        status = 'unpaid';
      }

      const proofFile = b.balancePaymentStatus === 'to_verify'
        ? (b.balanceProofFile || b.proofFile)
        : (b.proofFile || b.balanceProofFile);
      const attachmentUrl = proofFile
        ? (proofFile.startsWith('http') ? proofFile : `${API_BASE}${proofFile}`)
        : null;

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
        amount: `₱${basePrice.toLocaleString()}`,
        raw: b,
      };
    });
  }, [rawBookings]);

  const filteredPayments = useMemo(() => {
    return paymentsList.filter((payment) => {
      const matchesFilter =
        activeFilter === 'all' ||
        payment.status === activeFilter ||
        (activeFilter === 'rejected' && payment.status === 'balance_rejected');
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        payment.clientName.toLowerCase().includes(query) ||
        payment.bookingId.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [paymentsList, activeFilter, search]);

  const handleReviewRequest = (payment) => {
    setSelectedPayment(payment);
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
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="payments-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by name, booking id..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

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
    </>
  );
}

/* =====================================================================
   REFUNDS PANEL
   ===================================================================== */
const REFUND_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Processed', label: 'Processed' },
  { key: 'Flagged', label: 'Flagged' },
];

// Reuses the existing status-pill color language: amber for "awaiting admin action",
// green for "done" — same as PAYMENT_STATUS_META's to_verify/fully_paid colors.
const REFUND_STATUS_META = {
  Pending: { label: 'Pending', className: 'status-pill status-pill--verify' },
  Processed: { label: 'Processed', className: 'status-pill status-pill--full' },
};

/* ── Refund Review Modal ──────────────────────────────── */
function RefundReviewModal({ refund, onClose, onSuccess }) {
  const [dispatchDeduction, setDispatchDeduction] = useState('');
  const [proof, setProof] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingFlag, setResolvingFlag] = useState(false);
  const [error, setError] = useState('');

  if (!refund) return null;

  const isPending = refund.status === 'Pending';
  const isFlagged = Boolean(refund.customerFlag?.flagged && !refund.customerFlag?.resolved);
  const deductionNum = Number(dispatchDeduction) || 0;
  const previewRefundable = refund.isSameDay
    ? Math.max(refund.downPaymentAmount - deductionNum, 0)
    : refund.downPaymentAmount;

  const handleProcess = async () => {
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
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('proof', proof);
      if (refund.isSameDay) formData.append('dispatchDeduction', deductionNum);

      const res = await fetch(`${API_BASE}/api/bookings/${refund.bookingId}/refund`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets it for FormData
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to process refund.');
      }

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
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/bookings/${refund.bookingId}/refund/flag/resolve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to resolve flag.');
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
        <div className="modal-header" style={{ marginBottom: '4px' }}>
          <h4 className="modal-title">{isPending ? 'Review Refund Request' : 'Refund Details'}</h4>
          <button className="modal-close-btn" onClick={onClose} disabled={submitting || resolvingFlag}>
            <CloseIcon />
          </button>
        </div>

        <p className="payment-review-booking">{refund.serviceType} · {refund.bookingId}</p>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
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
          <div className="payment-review-cell" style={{ marginBottom: '16px' }}>
            <span className="confirmation-detail-label">Dispatch / Transportation Deduction</span>
            <span className="confirmation-detail-value">₱{refund.dispatchDeduction?.toLocaleString()}</span>
          </div>
        )}

        <div className="payment-review-cell" style={{ marginBottom: '20px' }}>
          <span className="confirmation-detail-label">
            {isPending ? 'Refundable Amount' : 'Refunded Amount'}
          </span>
          <span className="confirmation-detail-value">
            ₱{(isPending ? previewRefundable : refund.refundableAmount)?.toLocaleString()}
          </span>
        </div>

        {isPending && (
          <div className="modal-upload-group">
            <label className="modal-upload-label">Proof the refund was sent</label>
            <label className="modal-file-btn">
              {proof ? proof.name : '[Choose a file]'}
              <input
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => setProof(e.target.files[0] || null)}
              />
            </label>
            {!proof && (
              <p style={{ fontSize: '11px', color: '#e05a5a', marginTop: '2px' }}>
                Required before this refund can be marked processed.
              </p>
            )}
          </div>
        )}

        {!isPending && refund.proofFile && (
          <div className="payment-review-cell" style={{ marginBottom: '16px' }}>
            <span className="confirmation-detail-label">Proof of Refund</span>
            <a
              href={`${API_BASE}${refund.proofFile}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sdm-link"
            >
              View File
            </a>
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
          <button type="button" className="bs-next-btn" style={{ width: '100%' }} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

function RefundCard({ refund, onReview }) {
  const isFlagged = Boolean(refund.customerFlag?.flagged && !refund.customerFlag?.resolved);

  return (
    <div className="refund-card">
      <div className="refund-card__main">
        <div className="refund-card__header">
          <span className="refund-card__client">{refund.clientName}</span>
          <span className="refund-card__dot">·</span>
          <StatusBadge status={refund.status} meta={REFUND_STATUS_META} />
          {refund.isSameDay && <span className="refund-card__same-day-tag">Same-day cancellation</span>}
          {isFlagged && <span className="refund-card__flag-tag">Flagged</span>}
        </div>
        <div className="refund-card__service">
          <span className="refund-card__service-type">{refund.serviceType}</span>
          <span className="refund-card__dot">·</span>
          <span className="refund-card__detail">{refund.bookingId}</span>
        </div>
      </div>

      <div className="refund-card__amount">
        <span className="refund-card__amount-label">
          {refund.status === 'Processed' ? 'Refunded' : 'Down Payment'}
        </span>
        <span className="refund-card__amount-value">
          ₱{(refund.status === 'Processed' ? refund.refundableAmount : refund.downPaymentAmount)?.toLocaleString()}
        </span>
      </div>

      <div className="refund-card__action">
        <button type="button" className="refund-card__review-btn" onClick={() => onReview(refund)}>
          {isFlagged ? 'Review Flag' : refund.status === 'Pending' ? 'Review' : 'View'}
        </button>
      </div>
    </div>
  );
}

function RefundsPanel() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [rawBookings, setRawBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch bookings');
      const data = await res.json();
      setRawBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching refunds:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Only bookings that actually opened a refund request are relevant here —
  // a cancelled cleaning booking with no down payment never gets a refund object.
  const refundsList = useMemo(() => {
    return rawBookings
      .filter((b) => b.refund && b.refund.status !== 'None')
      .map((b) => {
        const clientName = typeof b.customer === 'object' ? (b.customer?.name || 'Customer') : 'Customer';
        const serviceType = typeof b.service === 'object' ? (b.service?.name || 'Service') : 'Service';

        return {
          id: b._id || b.bookingId,
          bookingId: b.bookingId,
          clientName,
          serviceType,
          status: b.refund.status,
          isSameDay: b.refund.isSameDay,
          downPaymentAmount: b.refund.downPaymentAmount,
          dispatchDeduction: b.refund.dispatchDeduction,
          refundableAmount: b.refund.refundableAmount,
          proofFile: b.refund.proofFile,
          customerFlag: b.refund.customerFlag,
          requestedAt: b.refund.requestedAt,
        };
      })
      .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
  }, [rawBookings]);

  const filteredRefunds = useMemo(() => {
    return refundsList.filter((refund) => {
      const isFlagged = Boolean(refund.customerFlag?.flagged && !refund.customerFlag?.resolved);
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'Flagged' ? isFlagged : refund.status === activeFilter);
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        refund.clientName.toLowerCase().includes(query) ||
        refund.bookingId.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [refundsList, activeFilter, search]);

  const handleReview = (refund) => {
    setSelectedRefund(refund);
  };

  return (
    <>
      <div className="refunds-toolbar">
        <div className="refunds-filters">
          {REFUND_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${activeFilter === filter.key ? 'filter-pill--active' : ''}`}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="refunds-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by name, booking id..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="refunds-empty">Loading refund requests...</div>
      ) : (
        <div className="refunds-list">
          {filteredRefunds.length === 0 ? (
            <div className="refunds-empty">No refund requests match your search.</div>
          ) : (
            filteredRefunds.map((refund) => (
              <RefundCard key={refund.id} refund={refund} onReview={handleReview} />
            ))
          )}
        </div>
      )}

      {selectedRefund && (
        <RefundReviewModal
          refund={selectedRefund}
          onClose={() => setSelectedRefund(null)}
          onSuccess={fetchBookings}
        />
      )}
    </>
  );
}

/* =====================================================================
   MAIN — tab switch between Payments and Refunds
   ===================================================================== */
function Payments() {
  const [activeTab, setActiveTab] = useState('payments');

  return (
    <AdminLayout title="Payments">
      <h1 className="dashboard-welcome">Payments</h1>
      <div className="payments-top-tabs">
        {TOP_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`filter-pill payments-top-tab ${activeTab === tab.key ? 'filter-pill--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'payments' ? <PaymentsPanel /> : <RefundsPanel />}
    </AdminLayout>
  );
}

export default Payments;
